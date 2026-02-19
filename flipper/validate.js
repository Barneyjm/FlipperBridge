#!/usr/bin/env node
/**
 * validate.js — Static analyzer for Flipper Zero mJS scripts.
 *
 * Usage:
 *   node validate.js [path/to/script.js]
 *
 * Defaults to flipper_bridge.js in the same directory as this script.
 *
 * Exit codes:
 *   0 — No errors (warnings only, or clean)
 *   1 — One or more ERRORs found
 */

"use strict";

var fs = require("fs");
var path = require("path");

// ---------------------------------------------------------------------------
// Issue collector
// ---------------------------------------------------------------------------

/** @type {Array<{line: number, col: number, severity: string, message: string}>} */
var issues = [];

/**
 * Record an issue.
 * @param {number} lineNo  1-based line number
 * @param {number} col     1-based column number
 * @param {"ERROR"|"WARN"} severity
 * @param {string} message
 */
function report(lineNo, col, severity, message) {
    issues.push({ line: lineNo, col: col, severity: severity, message: message });
}

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

/**
 * Strip single-line comments (//) and multi-line comments (/* ... * /) from
 * a line.  String literals are preserved so that comment-like content inside
 * strings does not confuse the checker.
 *
 * Returns the "code-only" portion of the line (comment text replaced with
 * spaces to keep column numbers accurate).
 *
 * NOTE: This is a simplistic single-line stripper; it does NOT handle
 * multi-line string literals or escaped quotes inside strings perfectly, but
 * it is accurate enough for the patterns we are checking.
 *
 * @param {string} line
 * @param {boolean} inBlockComment  Whether we enter this line inside a block comment.
 * @returns {{code: string, inBlockComment: boolean}}
 */
function stripComments(line, inBlockComment) {
    var result = "";
    var i = 0;
    var len = line.length;

    if (inBlockComment) {
        // Scan for the end of the block comment.
        while (i < len) {
            if (line[i] === "*" && line[i + 1] === "/") {
                result += "  "; // keep column alignment
                i += 2;
                inBlockComment = false;
                break;
            }
            result += " ";
            i++;
        }
        if (inBlockComment) {
            // Still inside block comment at end of line.
            return { code: result + line.slice(i).replace(/./g, " "), inBlockComment: true };
        }
    }

    while (i < len) {
        var ch = line[i];

        // String literals — skip content until closing quote.
        if (ch === '"' || ch === "'") {
            var quote = ch;
            result += ch;
            i++;
            while (i < len) {
                var sc = line[i];
                result += sc;
                if (sc === "\\" && i + 1 < len) {
                    i++;
                    result += line[i]; // escaped char
                } else if (sc === quote) {
                    break;
                }
                i++;
            }
            i++;
            continue;
        }

        // Backtick — template literal start (itself an error, but include it).
        if (ch === "`") {
            var tlStart = i;
            result += ch;
            i++;
            while (i < len) {
                var tc = line[i];
                result += tc;
                if (tc === "\\" && i + 1 < len) {
                    i++;
                    result += line[i];
                } else if (tc === "`") {
                    break;
                }
                i++;
            }
            i++;
            continue;
        }

        // Single-line comment.
        if (ch === "/" && line[i + 1] === "/") {
            // Rest of line is a comment — pad with spaces.
            result += line.slice(i).replace(/./g, " ");
            i = len;
            continue;
        }

        // Block comment start.
        if (ch === "/" && line[i + 1] === "*") {
            result += "  ";
            i += 2;
            inBlockComment = true;
            while (i < len) {
                if (line[i] === "*" && line[i + 1] === "/") {
                    result += "  ";
                    i += 2;
                    inBlockComment = false;
                    break;
                }
                result += " ";
                i++;
            }
            continue;
        }

        result += ch;
        i++;
    }

    return { code: result, inBlockComment: inBlockComment };
}

/**
 * Determine whether a given character index in `code` is inside a function
 * body.  We do a simple brace-depth walk from the start of the file up to
 * `globalIdx`.  Depth 0 means top level; depth > 0 means inside a function.
 *
 * @param {string[]} codeLines  Stripped code lines (no comments).
 * @param {number} targetLine   0-based line index.
 * @param {number} targetCol    0-based column index.
 * @returns {boolean}
 */
function isInsideFunction(codeLines, targetLine, targetCol) {
    var depth = 0;
    for (var li = 0; li <= targetLine; li++) {
        var lineStr = codeLines[li];
        var colEnd = li === targetLine ? targetCol : lineStr.length;
        for (var ci = 0; ci < colEnd; ci++) {
            var c = lineStr[ci];
            if (c === "{") depth++;
            else if (c === "}") { depth--; if (depth < 0) depth = 0; }
        }
    }
    return depth > 0;
}

// ---------------------------------------------------------------------------
// Main analysis
// ---------------------------------------------------------------------------

/**
 * Analyze the mJS source text.
 * @param {string} source  Full file contents.
 */
function analyze(source) {
    var rawLines = source.split(/\r?\n/);

    // Build comment-stripped versions of each line, preserving column positions.
    var codeLines = [];
    var inBlock = false;
    for (var i = 0; i < rawLines.length; i++) {
        var stripped = stripComments(rawLines[i], inBlock);
        codeLines.push(stripped.code);
        inBlock = stripped.inBlockComment;
    }

    // Track required modules to detect duplicates.
    /** @type {Object.<string, number>} module name -> first seen line (1-based) */
    var requiredModules = {};

    var KNOWN_MODULES = [
        "serial", "storage", "gpio", "notification",
        "badusb", "dialog", "textbox", "submenu", "math",
        "event_loop", "gui", "gui/dialog", "gui/text_input", "gui/loading"
    ];

    // We need function-boundary awareness for a few checks.
    // Build a list of function start lines (lines containing "function").
    // For parameter-reassignment checks we parse function signatures manually.

    // -------------------------------------------------------------------------
    // Line-by-line checks
    // -------------------------------------------------------------------------
    for (var li = 0; li < codeLines.length; li++) {
        var code = codeLines[li];
        var raw = rawLines[li];
        var lineNo = li + 1; // 1-based

        // Helper: find first match position (col is 1-based).
        function firstMatch(re) {
            var m = re.exec(code);
            return m ? { col: m.index + 1, match: m[0], index: m.index } : null;
        }

        // -- 1. Arrow functions -----------------------------------------------
        // Match => that is not inside a string. stripComments already zeroed out
        // string contents, so a literal => in `code` is real code.
        var arrowMatch = /=>/.exec(code);
        if (arrowMatch) {
            report(lineNo, arrowMatch.index + 1, "ERROR", "Arrow functions are not supported in mJS");
        }

        // -- 2. const / class keywords ----------------------------------------
        var constMatch = /\bconst\b/.exec(code);
        if (constMatch) {
            report(lineNo, constMatch.index + 1, "ERROR", "'const' is not supported — use 'let' or 'var'");
        }
        var classMatch = /\bclass\b/.exec(code);
        if (classMatch) {
            report(lineNo, classMatch.index + 1, "ERROR", "'class' is not supported in mJS");
        }

        // -- 3. Template literals (backticks) ---------------------------------
        // The strip routine preserves backtick content in `code`, so we can
        // detect them directly.
        var btMatch = /`/.exec(code);
        if (btMatch) {
            report(lineNo, btMatch.index + 1, "ERROR", "Template literals (backticks) are not supported in mJS");
        }

        // -- 4. Destructuring -------------------------------------------------
        // let/var { ... } = or let/var [ ... ] =
        var destructObjMatch = /\b(?:let|var)\s*\{/.exec(code);
        if (destructObjMatch) {
            report(lineNo, destructObjMatch.index + 1, "ERROR", "Object destructuring is not supported in mJS");
        }
        var destructArrMatch = /\b(?:let|var)\s*\[/.exec(code);
        if (destructArrMatch) {
            report(lineNo, destructArrMatch.index + 1, "ERROR", "Array destructuring is not supported in mJS");
        }

        // -- 5. Math global (capital M) ---------------------------------------
        // Match Math. but not math. — must be capital M.
        var mathCapMatch = /\bMath\./.exec(code);
        if (mathCapMatch) {
            report(lineNo, mathCapMatch.index + 1, "ERROR", "Global 'Math' does not exist in mJS — use require(\"math\") and lowercase math.*");
        }

        // -- 6. JSON.parse / JSON.stringify -----------------------------------
        var jsonParseMatch = /\bJSON\.parse\b/.exec(code);
        if (jsonParseMatch) {
            report(lineNo, jsonParseMatch.index + 1, "ERROR", "JSON.parse is not available in mJS — parse strings manually");
        }
        var jsonStringifyMatch = /\bJSON\.stringify\b/.exec(code);
        if (jsonStringifyMatch) {
            report(lineNo, jsonStringifyMatch.index + 1, "ERROR", "JSON.stringify is not available in mJS — build JSON strings manually");
        }

        // -- 7. Date global ---------------------------------------------------
        var dateMatch = /\bnew\s+Date\b|\bDate\.(?:now|parse|UTC)\b/.exec(code);
        if (dateMatch) {
            report(lineNo, dateMatch.index + 1, "ERROR", "Global 'Date' is not available in mJS");
        }

        // -- 8. try / catch / finally / throw ---------------------------------
        var tryMatch = /\btry\s*\{/.exec(code);
        if (tryMatch) {
            report(lineNo, tryMatch.index + 1, "ERROR", "'try' is not supported in mJS");
        }
        var catchMatch = /\bcatch\s*\(/.exec(code);
        if (catchMatch) {
            report(lineNo, catchMatch.index + 1, "ERROR", "'catch' is not supported in mJS");
        }
        var finallyMatch = /\bfinally\s*\{/.exec(code);
        if (finallyMatch) {
            report(lineNo, finallyMatch.index + 1, "ERROR", "'finally' is not supported in mJS");
        }
        var throwMatch = /\bthrow\b/.exec(code);
        if (throwMatch) {
            report(lineNo, throwMatch.index + 1, "ERROR", "'throw' is not supported in mJS");
        }

        // -- 9. typeof — WORKS in mJS (confirmed by interactive.js) — no check needed

        // -- 10. switch -------------------------------------------------------
        var switchMatch = /\bswitch\s*\(/.exec(code);
        if (switchMatch) {
            report(lineNo, switchMatch.index + 1, "ERROR", "'switch' is not supported in mJS — use if/else chains");
        }

        // -- 11. for...in / for...of ------------------------------------------
        // Match: for ( ... in ... ) or for ( ... of ... )
        // We match the keyword after the opening paren content.
        var forInMatch = /\bfor\s*\(.*\bin\b/.exec(code);
        if (forInMatch) {
            report(lineNo, forInMatch.index + 1, "ERROR", "'for...in' is not supported in mJS — use a C-style for loop");
        }
        var forOfMatch = /\bfor\s*\(.*\bof\b/.exec(code);
        if (forOfMatch) {
            report(lineNo, forOfMatch.index + 1, "ERROR", "'for...of' is not supported in mJS — use a C-style for loop");
        }

        // -- 12. require() calls ----------------------------------------------
        // Match: require("moduleName") or require('moduleName')
        var requireRe = /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g;
        var reqMatch;
        while ((reqMatch = requireRe.exec(code)) !== null) {
            var modName = reqMatch[1];
            var reqCol = reqMatch.index + 1;

            // 12a. Must be at top level (not inside a function).
            if (isInsideFunction(codeLines, li, reqMatch.index)) {
                report(lineNo, reqCol, "ERROR",
                    "require(\"" + modName + "\") called inside a function — require() must be at the top level only");
            }

            // 12b. Each module may only be required once.
            if (requiredModules.hasOwnProperty(modName)) {
                report(lineNo, reqCol, "ERROR",
                    "Module \"" + modName + "\" required more than once (first seen at line " + requiredModules[modName] + ")");
            } else {
                requiredModules[modName] = lineNo;
            }

            // 12c. Unknown module.
            var known = false;
            for (var ki = 0; ki < KNOWN_MODULES.length; ki++) {
                if (KNOWN_MODULES[ki] === modName) { known = true; break; }
            }
            if (!known) {
                report(lineNo, reqCol, "WARN",
                    "Unknown module \"" + modName + "\" — available modules: " + KNOWN_MODULES.join(", "));
            }
        }

        // -- 13b. Non-existent globals that look real ----------------------------
        var toStringGlobal = /\bto_string\s*\(/.exec(code);
        if (toStringGlobal) {
            report(lineNo, toStringGlobal.index + 1, "ERROR", "to_string() is not a global function — use value.toString() instead");
        }
        var toUpperGlobal = /\bto_upper_case\s*\(/.exec(code);
        if (toUpperGlobal) {
            report(lineNo, toUpperGlobal.index + 1, "ERROR", "to_upper_case() is not a global function — use str.toUpperCase() instead");
        }
        var toLowerGlobal = /\bto_lower_case\s*\(/.exec(code);
        if (toLowerGlobal) {
            report(lineNo, toLowerGlobal.index + 1, "ERROR", "to_lower_case() is not a global function — use str.toLowerCase() instead");
        }

        // -- 13c. substring() / charAt() — NOT supported in mJS ----------------
        var substringMatch = /\.substring\s*\(/.exec(code);
        if (substringMatch) {
            report(lineNo, substringMatch.index + 1, "ERROR", ".substring() does not exist in mJS — use .slice(start, end) or s[i] for single chars");
        }
        var charAtMatch = /\.charAt\s*\(/.exec(code);
        if (charAtMatch) {
            report(lineNo, charAtMatch.index + 1, "ERROR", ".charAt() does not exist in mJS — use s[i] bracket notation instead");
        }

        // -- 14. math.random() ------------------------------------------------
        var mathRandomMatch = /\bmath\.random\s*\(/.exec(code);
        if (mathRandomMatch) {
            report(lineNo, mathRandomMatch.index + 1, "WARN",
                "math.random() does not exist in mJS — there is no random number function available");
        }
    }

    // -------------------------------------------------------------------------
    // Multi-line / whole-file checks
    // -------------------------------------------------------------------------
    analyzeFunctions(rawLines, codeLines);
}

// ---------------------------------------------------------------------------
// Function-level analysis (checks 15 & 16)
// ---------------------------------------------------------------------------

/**
 * Parse out function definitions from the code lines and check:
 *   15. Parameter reassignment inside the function body.
 *   16. Calling .substring() / .indexOf() on a parameter variable.
 *
 * Strategy: scan for `function name(params)` patterns, then walk the
 * corresponding brace-delimited body.
 *
 * @param {string[]} rawLines
 * @param {string[]} codeLines
 */
function analyzeFunction(rawLines, codeLines) {
    // Intentional alias — see analyzeFunction call site.
}

function analyzeFunctions(rawLines, codeLines) {
    // Join all code into one string with newline delimiters so we can find
    // function bodies across lines.  We track position back to line/col via
    // an offset->line map.

    // Build cumulative offset table.
    var offsets = []; // offsets[i] = char offset of start of line i in joined string
    var joined = "";
    for (var li = 0; li < codeLines.length; li++) {
        offsets.push(joined.length);
        joined += codeLines[li] + "\n";
    }

    /**
     * Given a character offset in `joined`, return { line, col } (1-based).
     * @param {number} offset
     * @returns {{line: number, col: number}}
     */
    function posOf(offset) {
        // Binary search through offsets.
        var lo = 0;
        var hi = offsets.length - 1;
        while (lo < hi) {
            var mid = Math.floor((lo + hi + 1) / 2);
            if (offsets[mid] <= offset) lo = mid;
            else hi = mid - 1;
        }
        return { line: lo + 1, col: offset - offsets[lo] + 1 };
    }

    // Find all function definitions.
    // Pattern: function <name> ( <params> ) {
    // We also handle anonymous functions assigned to variables:
    //   let foo = function ( <params> ) {
    var funcRe = /\bfunction\s+(\w+)\s*\(([^)]*)\)\s*\{|\bfunction\s*\(([^)]*)\)\s*\{/g;
    var m;

    while ((m = funcRe.exec(joined)) !== null) {
        var funcName = m[1] || "(anonymous)";
        var paramStr = m[2] !== undefined ? m[2] : m[3];
        var params = paramStr.split(",").map(function(p) { return p.trim(); }).filter(function(p) { return p.length > 0; });

        if (params.length === 0) continue;

        // Find the matching closing brace for this function body.
        // The opening brace is the last char matched (index m.index + m[0].length - 1).
        var bodyStart = m.index + m[0].length; // position right after opening {
        var depth = 1;
        var bi = bodyStart;
        while (bi < joined.length && depth > 0) {
            var bc = joined[bi];
            // Skip string literals to avoid counting braces inside strings.
            if (bc === '"' || bc === "'") {
                var q = bc;
                bi++;
                while (bi < joined.length) {
                    if (joined[bi] === "\\" && bi + 1 < joined.length) { bi += 2; continue; }
                    if (joined[bi] === q) break;
                    bi++;
                }
            } else if (bc === "{") {
                depth++;
            } else if (bc === "}") {
                depth--;
            }
            bi++;
        }
        var bodyEnd = bi; // exclusive

        var body = joined.slice(bodyStart, bodyEnd);
        var bodyOffset = bodyStart;

        // -- Check 15: parameter reassignment ---------------------------------
        for (var pi = 0; pi < params.length; pi++) {
            var param = params[pi];
            if (!param || !/^\w+$/.test(param)) continue;

            // Match: param = <something> but NOT == or != or <= or >=
            // We also skip param++ / param-- (those are reassignments but rarely
            // a problem; flag them anyway since mJS can be picky).
            var assignRe = new RegExp("\\b" + param + "\\s*(?:=(?!=)|\\+\\+|--)","g");
            var am;
            while ((am = assignRe.exec(body)) !== null) {
                var absOffset = bodyOffset + am.index;
                var pos = posOf(absOffset);
                report(pos.line, pos.col, "WARN",
                    "Function '" + funcName + "': parameter '" + param + "' is reassigned — mJS may not reflect this change at the call site");
            }
        }

        // -- Check 16: .substring() / .indexOf() called on a parameter -------
        for (var pi2 = 0; pi2 < params.length; pi2++) {
            var param2 = params[pi2];
            if (!param2 || !/^\w+$/.test(param2)) continue;

            var strMethodRe = new RegExp("\\b" + param2 + "\\s*\\.\\s*(?:substring|indexOf)\\s*\\(", "g");
            var sm;
            while ((sm = strMethodRe.exec(body)) !== null) {
                var absOffset2 = bodyOffset + sm.index;
                var pos2 = posOf(absOffset2);
                report(pos2.line, pos2.col, "WARN",
                    "Function '" + funcName + "': calling ." + (sm[0].indexOf("substring") !== -1 ? "substring" : "indexOf") + "() on parameter '" + param2 + "' — mJS can behave unexpectedly with string methods on passed-in string parameters");
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

function main() {
    var args = process.argv.slice(2);
    var targetPath;

    if (args.length > 0) {
        targetPath = path.resolve(args[0]);
    } else {
        targetPath = path.join(__dirname, "flipper_bridge.js");
    }

    if (!fs.existsSync(targetPath)) {
        console.error("validate.js: File not found: " + targetPath);
        process.exit(1);
    }

    var source = fs.readFileSync(targetPath, "utf8");
    console.log("Validating: " + targetPath);
    console.log("---");

    analyze(source);

    if (issues.length === 0) {
        console.log("No issues found.");
        process.exit(0);
    }

    // Sort by line, then col.
    issues.sort(function(a, b) {
        if (a.line !== b.line) return a.line - b.line;
        return a.col - b.col;
    });

    var errorCount = 0;
    var warnCount = 0;

    for (var i = 0; i < issues.length; i++) {
        var iss = issues[i];
        var locStr = String(iss.line) + ":" + String(iss.col);
        // Pad location to at least 8 chars for alignment.
        while (locStr.length < 8) locStr += " ";
        console.log(locStr + "  " + iss.severity + "  " + iss.message);
        if (iss.severity === "ERROR") errorCount++;
        else warnCount++;
    }

    console.log("---");
    console.log(errorCount + " error(s), " + warnCount + " warning(s)");

    process.exit(errorCount > 0 ? 1 : 0);
}

main();
