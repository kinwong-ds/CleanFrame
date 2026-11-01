# Walkthrough: CleanFrame on a Samsung Smart Monitor (LS43CG702, Tizen 6.5)

A record of one complete setup on a Samsung Smart Monitor, as a companion to
[the UN65DU6900 TV walkthrough](walkthrough-un65du6900.md). It covers the same
three changes — CleanFrame install, input shortcuts, and the **Home** button —
and focuses on where a Smart Monitor differs from a TV. Read the TV walkthrough
for the shared detail (Rosetta, the Finder prompt, SDB after standby, the
boot-backup trap); this document does not repeat it.

**This is one monitor's result, not a compatibility claim.** Read
[the setup guide](agent-tv-setup-guide.md) for the full risk statement. The Home
button change uses undocumented Samsung settings and a developer-transport
workaround. A firmware update can break it, including the restore.

Private values are not in this document: IP addresses, the device ID (DUID),
certificate passwords, the Samsung account and the SDK-generated app ID. They
live in ignored `.local/` files and a backup folder outside the repo.
Placeholders are written as `<LIKE_THIS>`.

## Result

| Item | Result on this monitor |
| --- | --- |
| Device | Samsung 43" Smart Monitor, LS43CG702NNXZA (Odyssey Neo G7), platform `22_PONTUSML_GMT7` |
| Firmware | `T-PTMLWWC-1720.7`, build `T-PTMLWWC-REL-202602250227` |
| OS / CPU | Tizen 6.5.0, ARMv7, 32-bit |
| Mac | Apple Silicon (arm64), macOS |
| CleanFrame | Owner's own signed build installed, launched and confirmed on screen |
| Shortcuts | YouTube, two inputs — **DP** and **PC** (HDMI 1) — and **Picture settings**, set in the in-app editor |
| Home button | Apply → physical Home opened CleanFrame, confirmed |
| Still untested | Power-on destination after the change, behaviour after certificate expiry |

## How a monitor differs from the TV

- **Developer Mode entry.** A Smart Monitor remote may have no **123**/number
  pad. See Stage 2.
- **Tizen 6.5, not 9.** CleanFrame still runs (it needs 6.5+). The Home helper's
  runtime is the catch: this monitor has **no .NET 6**, only up to 3.1. See
  Stage 7.
- **Several real inputs, with the same name.** The TV's viewer only ever showed
  the last-used input. This monitor reports DP and two HDMI ports, and its own
  settings name both DP and HDMI 1 "PC". The input code had to switch to a named
  port, not just open the viewer. See Stage 6.
- **Same app identity, new certificate.** You can reuse the `package_id` /
  `app_id` from the TV. The distributor certificate is per-device, so the
  monitor needs its own profile.

## Stage 1 — Details and network

Same as the TV. Record model, firmware, IP in a private `.local/` record, and
reserve the monitor's IP in the router. Keep the monitor's record **separate**
from the TV's so signing profiles, device IDs and Home snapshots never mix.

## Stage 2 — Developer Mode without a number pad

On this monitor the owner reached Developer Mode with the ordinary remote. If
your remote has no **123** or numeric pad, use one of these instead:

- **SmartThings app.** Add the monitor, open its remote; it has a numeric
  keypad.
- **USB keyboard.** Plug one into the monitor's USB port and type the digits.

Then the standard steps: **Apps → App Settings**, enter **12345**, set Developer
Mode **On**, enter the **Mac's** IP as Host PC IP, and power cycle. Confirm
through the info endpoint:

```sh
curl -s http://<MONITOR_IP>:8001/api/v2/ | python3 -c "import sys,json;d=json.load(sys.stdin)['device'];print(d['modelName'],d['developerMode'],d['developerIP'])"
```

Expect `LS43CG702NNXZA`, `developerMode` = `1` and your Mac's IP.

## Stage 3 — Connect

```sh
~/tizen-studio/tools/sdb connect <MONITOR_IP>:26101
~/tizen-studio/tools/sdb -s <MONITOR_IP>:26101 capability    # platform_version 6.5, cpu_arch armv7
~/tizen-studio/tools/sdb -s <MONITOR_IP>:26101 shell 0 applist > .local/monitor-applist.txt
```

Two connection gotchas here:

- **One device already connected.** With the TV still connected, the monitor's
  `connect` failed. Disconnecting the other device and restarting the SDB server
  cleared it:

  ```sh
  ~/tizen-studio/tools/sdb disconnect <OTHER_IP>:26101
  ~/tizen-studio/tools/sdb kill-server && ~/tizen-studio/tools/sdb start-server
  ~/tizen-studio/tools/sdb connect <MONITOR_IP>:26101
  ```

- **Port closed until a wall power cycle**, same as the TV: 8001 and ping
  answered while 26101 was shut. Switching off at the wall for 10 seconds
  restored it.

From the app list, this monitor had YouTube (`9Ur5IzDKqV.TizenYouTube`), Samsung
TV Plus, Internet and Gaming Hub, and the input viewer `org.tizen.tv-viewer`. No
Netflix, Prime Video, Disney+ or Paramount+. Samsung Home is
`com.samsung.tv.csfs`, as on the TV.

## Stage 4 — Certificate (own profile)

Make a **new profile** for the monitor and leave the TV's profile untouched, so
the TV's working certificate is never at risk. With **only the monitor
connected** (so Certificate Manager reads the monitor's DUID, not the TV's):

1. Open `~/tizen-studio/tools/certificate-manager/certificate-manager.app`.
2. **+ → Samsung → TV**, name the profile (here `<PROFILE>`).
3. **Author certificate:** reuse the TV's author certificate if you want one
   identity across devices, or make a new one. Either works; the author only has
   to be consistent for future updates **on this monitor**.
4. **Distributor certificate:** privilege **Public**. Select the **connected
   monitor** to fill its DUID.
5. Leave the TV's profile active if you like; the build picks the profile from
   `.local/signing.json`.

Check it:

```sh
openssl x509 -in ~/SamsungCertificate/<PROFILE>/distributor.crt -noout -dates -ext subjectAltName
```

The `URN:tizen:deviceid=` must be the monitor's DUID. **Back up the whole
`~/SamsungCertificate/<PROFILE>` folder off the Mac.**

> If the monitor's author certificate is a different one from the TV's, every
> future update **on the monitor** must be signed with the monitor's profile.
> Keep its backup.

## Stage 5 — Per-device config, build and install

Reuse the same `package_id` / `app_id` as the TV. Keep a settings pair per
device so you never sign for the wrong one:

```sh
# .local/signing-monitor.json  → profile "<PROFILE>", same package_id/app_id
# .local/device-monitor.json    → {"host": "<MONITOR_IP>"}
cp .local/signing-monitor.json .local/signing.json
cp .local/device-monitor.json  .local/device.json
```

Then the standard build:

```sh
npm run check
npm run package
npm run tv:install
npm run tv:launch
```

A successful install is the final proof the distributor certificate matches the
monitor. Confirm CleanFrame on screen.

> **Switch back before building for the TV.** Copy the TV's pair
> (`signing-tv.json`, `device-tv.json`) over `signing.json` / `device.json`
> first, or you will sign for the wrong device.

## Stage 6 — Inputs as app shortcuts

YouTube: add it from **Apps on Home** in the editor.

The inputs are the monitor-specific part. Unlike the TV, this monitor has
several real inputs and names more than one "PC", so a single "last-used input"
shortcut isn't enough. The source change on this branch
([app/device.js](../app/device.js)) now, **on screens that report their video
sources**, lists one shortcut per port in place of the single TV input:

| Port | Shortcut name |
| --- | --- |
| DisplayPort 1 | `DP` |
| HDMI 1 | `PC` (owner's label, set in code — the monitor itself calls both inputs "PC") |
| HDMI 2 | `HDMI 2` |

Opening one calls `tizen.tvwindow.setSource(...)` to switch the main source,
then opens `org.tizen.tv-viewer`. CleanFrame then hides itself, because the
viewer can otherwise stay **behind** CleanFrame when it was already running. The
new `tv.window` privilege in [app/config.xml](../app/config.xml) is required for
the source switch. Tests in [scripts/test-device.mjs](../scripts/test-device.mjs)
cover the input list, the switch-then-show order and a missing input.

Screens that do **not** report their inputs (such as the UN65 TV) keep the
single **TV input** entry, so one build serves both.

### Probing a new monitor's inputs

Before trusting the list, read the monitor's sources from a short, signed probe
widget (read-only) or confirm on screen. The values come from
`tizen.systeminfo.getPropertyValue('VIDEOSOURCE', ...)`, whose `connected` and
`disconnected` arrays give each `{type, number, editName}`. On this monitor:

- connected: HDMI 1 (`editName` "PC")
- disconnected: HDMI 2, DP 1 (`editName` "PC")

The port names shown in CleanFrame come from the code (`SOURCE_NAMES`), because
the monitor's own `editName` was "PC" for two different ports. Adjust that map
for another monitor's ports and labels.

### Picture settings shortcut

The monitor's Settings app (`com.samsung.tv.coba.setting`) reports a successful
launch but never comes onto the screen, whether launched from an app or with
`sdb shell 0 execute`. The hidden system app `org.tizen.menu` does: launched
either way, it opened the **Picture** menu every time, including after the owner
had last used a different Settings page. CleanFrame lists it as
**Picture settings**, and Eye Saver Mode is a few presses away under Eye Care.

Setting Eye Saver Mode directly is not possible from CleanFrame. The public
`webapis.tvinfo` menu keys cover only captions, accessibility, audio language
and UI timeout; `webapis.avinfo` has picture setters but no Eye Saver; and
`webapis.productinfo.setSystemConfig` returns a permission error without a
partner certificate.

## Stage 7 — Home button (native Home)

**Higher risk; get explicit approval before applying.** As on the TV, the
tracked helper in [scripts/native-home/](../scripts/native-home/) is **left
intact**, and an adapted private copy was made — here in a **separate**
`.local/native-home-monitor/` (ignored, backed up outside the repo), so the
monitor's guards and snapshots never mix with the TV's.

### Changes in the private monitor copy

| File | Change |
| --- | --- |
| `run.py` | Working dir → `.local/native-home-monitor` |
| `run.py` | Model guard → the monitor's `modelName` (`LS43CG702NNXZA`) from port 8001 |
| `Control.cs` | Firmware guard → `Version=<EXACT_FIRMWARE>;` (the monitor's string, from inspect) |
| `Control.cs` | `Target` and install-folder check keep the shared `<PACKAGE_ID>` / `<APP_ID>`, since the same app is installed |
| `Control.csproj` | **Target framework `net6.0` → `netcoreapp3.1`** (see below) |

### The runtime catch: no .NET 6

The read-only `inspect` showed the monitor's newest .NET is **3.1.3** — runtimes
2.0 through 3.1, no 6.x. The TV helper targets .NET 6, so it would not run here.
The three native libraries the helper needs were all present, and the user was
UID 901 on `armv7l`.

Retargeting the helper to `netcoreapp3.1` and rebuilding was enough. The build
produces a `runtimeconfig.json` naming framework version `3.1.0`; .NET's patch
roll-forward runs it on the monitor's 3.1.3. The .NET 6 SDK on the Mac builds
`netcoreapp3.1` without a separate 3.1 SDK:

```sh
cd .local/native-home-monitor/src && ~/.dotnet/dotnet build -c Release -o ../out
rm -f ../out/CleanFrameHomeControl.runtimeconfig.dev.json   # don't stage the dev config
```

### Sequence used

1. **Inspect (read-only):** `python3 .local/native-home-monitor/src/run.py inspect`.
   Confirmed UID 901, `armv7l`, the firmware line, the available .NET runtimes
   (the 3.1 finding), and the native libraries. `inspect` pushes no compiled
   helper.
2. **Query (read-only):** `run.py query` — runs the retargeted helper to prove it
   loads on 3.1.3 and reads the current values. `BootSupported` was `1`.
3. **Save originals:** write the query's JSON line to
   `.local/native-home-monitor/original.json`, mode 400, and back it up with
   `src/` and `out/` outside the repo.
4. **Apply:** `run.py apply original.json`. Read back, then the owner pressed
   Home: CleanFrame opened.

### Values on this monitor

| Setting | Original | After apply |
| --- | --- | --- |
| Home operation (`aul` main) | `com.samsung.tv.csfs` | `<APP_ID>` |
| `db/appfw/home_appid` | `com.samsung.tv.csfs` | `<APP_ID>` |
| `db/appfw/startup_appid` | `org.tizen.tv-viewer` | `<APP_ID>` (derived by the monitor) |
| `db/appfw/booting_appid_backup` | `org.tizen.tv-viewer` | `<APP_ID>` (derived) |
| `db/first_screen/type` | `com.samsung.tv.csfs` | `com.samsung.tv.csfs` |
| `db/menu/smart_hub/ontvsetting/auto_start` | `0` | `1` |

The helper writes only the Home operation, `home_appid` and autostart; the
monitor derived the other two on apply. Read the TV walkthrough's **boot-backup
trap** before any re-apply — the same dynamic `booting_appid_backup` applies.

### Restore

```sh
python3 .local/native-home-monitor/src/run.py restore original.json
```

Restore **before** uninstalling CleanFrame or changing its app ID. After a
firmware update the firmware guard refuses every action, including restore;
review before changing the guard.

## Afterwards

Same as the TV: certificate expiry (install-time check, so the installed app is
expected to keep running; reinstalling needs renewed certificates), firmware
auto-update being the larger risk, factory reset restoring Samsung Home, and
keeping the recovery folder and certificate backup off the Mac.

## Checklist for another monitor

- [ ] Model, full firmware string and IP recorded in a **separate** record; IP reserved
- [ ] Developer Mode on (SmartThings or USB keyboard if no number pad); restarted
- [ ] Identity checked through port 8001 before `sdb connect`; other devices disconnected
- [ ] `capability` shows Tizen ≥ 6.5 and 32-bit
- [ ] Own distributor profile covering the monitor's DUID; backed up
- [ ] Per-device signing/device config selected before `npm run package`
- [ ] `npm run check`, `package`, `tv:install`, `tv:launch`; CleanFrame seen on screen
- [ ] Inputs probed (`VIDEOSOURCE`); port name map adjusted; DP/PC/HDMI shortcuts added
- [ ] `sdb shell 0 execute org.tizen.menu` opens Picture on screen before adding Picture settings
- [ ] Private helper copy in its own folder (model, firmware, **framework** after inspect) and built
- [ ] Inspect → query → save snapshot → back up outside the repo
- [ ] Apply → physical Home check → restore path known
- [ ] Power-on destination checked, or recorded as untested
