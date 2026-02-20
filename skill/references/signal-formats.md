# Flipper Zero Signal File Formats

All formats are plain text. Generate inline and send via `subghz` or `write_file` commands.

## Sub-GHz (.sub)

### Key file (known protocol)

```
Filetype: Flipper SubGhz Key File
Version: 1
Frequency: 433920000
Preset: FuriHalSubGhzPresetOok650Async
Protocol: Princeton
Bit: 24
Key: 00 00 00 00 00 95 D5 D4
TE: 400
```

### RAW file (arbitrary signal)

```
Filetype: Flipper SubGhz RAW File
Version: 1
Frequency: 433920000
Preset: FuriHalSubGhzPresetOok650Async
Protocol: RAW
RAW_Data: 29262 361 -68 2635 -66 24113 ...
```

- RAW_Data: signed integers in microseconds. Positive = TX on, negative = TX off. Max 512 per line.
- Frequencies: 300000000, 315000000, 390000000, 433920000, 868350000, 915000000
- Presets: `FuriHalSubGhzPresetOok270Async`, `FuriHalSubGhzPresetOok650Async`, `FuriHalSubGhzPreset2FSKDev238Async`, `FuriHalSubGhzPreset2FSKDev476Async`
- Protocols: Princeton, Nice FLO, CAME, Linear, GateTX, Holtek, MegaCode, Firefly

## Infrared (.ir)

```
Filetype: IR signals file
Version: 1
#
name: Power
type: parsed
protocol: NECext
address: EE 87 00 00
command: 5D A0 00 00
```

- `type: parsed` — known protocol with address + command (4 bytes each, hex)
- `type: raw` — add `frequency: 38000`, `duty_cycle: 0.330000`, `data: <space-separated microsecond timings>` (max 1024 elements)
- Protocols: NEC, NECext, NEC42, Samsung32, RC6, RC5, SIRC, SIRC15, SIRC20, Kaseikyo, RCA
- Multiple buttons in one file: separate with `#` comment + `name:` header

## RFID (.rfid)

```
Filetype: Flipper RFID key
Version: 1
Key type: H10301
Data: FA BC 12
```

- Key types: EM4100, H10301, HIDProx, HIDExt, Indala26, FDX-A, FDX-B, Paradox, etc.
- H10301 (Wiegand 26-bit): 3 bytes = facility (1 byte) + card code (2 bytes)

## NFC (.nfc)

```
Filetype: Flipper NFC device
Version: 4
Device type: NTAG/Ultralight
UID: 04 85 90 54 12 98 23
ATQA: 00 44
SAK: 00
```

- Device types: ISO14443-3A, ISO14443-4A, NTAG/Ultralight, Mifare Classic, Mifare DESFire
- NTAG/Ultralight extends with page data, Mifare Classic with block data
- Cannot be transmitted via mJS (no NFC module) — write for manual use only

## File paths on SD card

- `/ext/subghz/` — Sub-GHz files
- `/ext/infrared/` — IR files
- `/ext/lfrfid/` — RFID files
- `/ext/nfc/` — NFC files
