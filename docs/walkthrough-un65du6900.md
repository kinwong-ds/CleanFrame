# Walkthrough: CleanFrame on a Samsung UN65DU6900 (Tizen 9)

A record of one complete setup on a second owner's TV, written so the same changes can be repeated on another Samsung TV. It covers the CleanFrame installation, a **TV input** shortcut for an HDMI device, and assigning the remote's **Home** button to CleanFrame.

**This is one TV's result, not a compatibility claim.** Read [the setup guide](agent-tv-setup-guide.md) for the full risk statement. The Home button change uses undocumented Samsung settings and a developer-transport workaround. A firmware update can break it, including the restore.

Private values are not in this document: IP addresses, the device ID (DUID), certificate passwords, the Samsung account and the SDK-generated app ID. They live in ignored `.local/` files and a backup folder outside the repo. Placeholders are written as `<LIKE_THIS>`.

## Result

| Item | Result on this TV |
| --- | --- |
| TV | Samsung 65" Crystal UHD, UN65DU6900FXZC (Canada, 2024) |
| Firmware | `T-KSU2EDAKUC-0090-2130.0`, build `T-KSU2EDAKUC-0090-REL-202605141700` |
| OS / CPU | Tizen 9.0.0, ARMv7, 32-bit (same platform as the reference Frame) |
| Mac | Apple Silicon (arm64), macOS |
| CleanFrame | Owner's own signed build installed, launched and confirmed on screen |
| Shortcuts | YouTube, Paramount+ and **TV input** (opens the HDMI 1 device), set in the in-app editor |
| Home button | Apply → physical Home opened CleanFrame; restore → Home opened Samsung Home; re-apply → CleanFrame again |
| Still untested | Power-on destination after the change, CleanFrame's "open Samsung Home" escape, behaviour after certificate expiry |

## Before starting on another TV

Expect differences. Check each of these on the new TV before reusing anything below:

- **Model and firmware.** The Home helper guards on the exact model name and firmware string. Both change for another TV.
- **Tizen version and CPU.** CleanFrame needs Tizen 6.5+. The Home helper needs a 32-bit SDK user (UID 901) and the TV's .NET 6 runtime.
- **App IDs.** Read them from that TV's app list. Don't copy them from this one.
- **One certificate profile per TV.** The distributor certificate is locked to one TV's DUID. Either create a new profile for the second TV, or add its DUID to a distributor certificate covering both. Keep the same author certificate if you want one identity across both TVs.
- **One app identity.** You can reuse the same `package_id` / `app_id` from `.local/signing.json` on both TVs. It only has to be consistent with the Home helper's target on each TV.

## Stage 1 — TV and network details

1. On the TV, open **Settings → Support → About This TV** and note the model code and software version.
2. Open **Settings → General → Network → Network Status → IP Settings** and note the IP address.
3. On the Mac, check the active interface address (`ipconfig getifaddr en0`) and that the default route uses it, not a VPN.
4. **Reserve the TV's IP address in the router now.** On this setup, the TV came back from a power cycle at a different address. A *different* Samsung device (a Smart Monitor) then answered on the old address. Check the device's identity before connecting (see Stage 3).

Keep everything in a private `.local/setup-record.md`.

## Stage 2 — Developer Mode

1. **Home → Apps → App Settings.** Press the remote's **123** button, enter **12345**.
2. Set Developer Mode **On**. Enter the **Mac's** IP as Host PC IP.
3. Restart the TV.

## Stage 3 — Samsung tools on an Apple Silicon Mac

Two gotchas came up here:

- **Rosetta is required.** Tizen Studio 6.1's macOS CLI installer bundles an x86_64 Java, and SDB is x86_64. Without Rosetta the installer fails with `Bad CPU type in executable`. The owner installs it with `softwareupdate --install-rosetta` and accepts Apple's licence themselves.
- **A Finder automation prompt.** The package manager runs `osascript` to create shortcuts in `~/Applications/tizen-studio`. If macOS's "…wants to control Finder" prompt isn't answered within 2 minutes, the install fails and rolls back. Rerun it and click **OK** on the prompt.

Commands used (installer from `https://download.tizen.org/sdk/Installer/tizen-studio_6.1/`, the owner accepted the licence):

```sh
bash web-cli_Tizen_Studio_6.1_macos-64.bin --accept-license "$HOME/tizen-studio"
~/tizen-studio/package-manager/package-manager-cli.bin install --accept-license \
  Certificate-Manager cert-add-on TV-SAMSUNG-Public-WebAppDevelopment \
  TV-SAMSUNG-Extension-Tools TV-SAMSUNG-Extension-Resources
```

The emulator isn't needed. SDB was version 4.2.36. The installer leaves the SDK path with no spaces, which the packager requires.

### Connect and read the TV

Before connecting, check that the address really is the intended TV. The TV's info endpoint reports the model and Developer Mode state:

```sh
curl -s http://<TV_IP>:8001/api/v2/ | python3 -c "import sys,json;d=json.load(sys.stdin)['device'];print(d['modelName'],d['developerMode'],d['developerIP'])"
```

Expect the right model, `developerMode` = `1` and your Mac's IP. Then:

```sh
~/tizen-studio/tools/sdb connect <TV_IP>:26101
~/tizen-studio/tools/sdb -s <TV_IP>:26101 capability     # platform_version, cpu_arch
~/tizen-studio/tools/sdb -s <TV_IP>:26101 shell 0 applist > .local/tv-applist.txt
```

**SDB stops after standby.** After the TV sat in standby overnight, port 26101 was closed while ports 8001 and ping still answered. Switching off at the wall for 10 seconds restored it, as on the reference Frame. A remote power-off isn't enough. Keep the TV on during a session.

## Stage 4 — Certificates

1. Open `~/tizen-studio/tools/certificate-manager/certificate-manager.app`.
2. **+ → Samsung → TV**, choose a profile name.
3. **Author certificate:** create a new one. The owner enters the name, password and Samsung sign-in. Keep the backup ticked.
4. **Distributor certificate:** privilege **Public**. Select the **connected TV** to fill its DUID. This is why SDB must be connected at this point.
5. Make the profile active.

Check the saved result:

```sh
sed -E 's/password="[^"]*"/password="***"/g' ~/tizen-studio-data/profile/profiles.xml
openssl x509 -in ~/SamsungCertificate/<PROFILE>/distributor.crt -noout -issuer -dates -ext subjectAltName
```

The distributor certificate's `URN:tizen:deviceid=` must match the TV's DUID. Both certificates were valid for one year. **Back up the whole `~/SamsungCertificate/<PROFILE>` folder and the passwords off the Mac.** Without the author certificate, an update means uninstalling first.

## Stage 5 — App identity, build and install

Generate a fresh, SDK-made identity once. Reuse it on later TVs if you want:

```sh
~/tizen-studio/tools/ide/bin/tizen create web-project -p tv-samsung-9.0 -t BasicEmptyProject -n CleanFrame -- <SCRATCH_DIR>
grep tizen:application <SCRATCH_DIR>/CleanFrame/config.xml
```

(`tv-samsung-public-2.4` is listed last by version sort and has no `WebBasicapplication` template. Choose the TV profile explicitly.)

Create `.local/signing.json` from `signing.example.json`:

```json
{
  "sdk_path": "/Users/<you>/tizen-studio",
  "profile": "<PROFILE>",
  "package_id": "<PACKAGE_ID>",
  "app_id": "<PACKAGE_ID>.CleanFrame",
  "password_file": null
}
```

and `.local/device.json` with `{"host": "<TV_IP>"}`. Then:

```sh
npm run check
npm run package        # signs with the profile; SDK-saved passwords, no prompt
npm run tv:install     # pushes, runs vd_appinstall, confirms the app list
npm run tv:launch
```

Check the packaged manifest has your identity (`unzip -p dist/CleanFrame.wgt config.xml | grep tizen:application`). A successful install is also the final proof that the distributor certificate matches the TV.

## Stage 6 — Shortcuts, including the HDMI device

CleanFrame's nine defaults include apps that may not exist on another region's TV. Rather than edit the defaults, use the TV: **Settings → Apps on Home**. Remove unwanted apps, then add others from **Not on Home**. Some IDs in `applist` are placeholders that only download on first open.

### TV input (HDMI) as an app

Probed with SDB on this TV, with the owner watching the screen:

| Target | Result |
| --- | --- |
| `org.tizen.SMSourceAPP` | Launched; nothing visible changed |
| `org.tizen.tv-viewer` | Showed the HDMI 1 device: the **last-used input**, not a fixed port |

`org.tizen.tv-viewer` is hidden from `getAppsInfo` consumers. The source change on this branch ([app/device.js](../app/device.js)) lists it once in the installed-app catalogue as **TV input**, without its system icon, at rank 25. A test in [scripts/test-device.mjs](../scripts/test-device.mjs) covers it. The defaults and the nine-app Home limit are unchanged. Add **TV input** from the editor. Launching it from CleanFrame opened the HDMI 1 device.

If the TV is used with several inputs, this opens whichever was last. Selecting a specific port wasn't attempted.

On another TV, probe the same two IDs first:

```sh
~/tizen-studio/tools/sdb -s <TV_IP>:26101 shell 0 execute org.tizen.tv-viewer
```

## Stage 7 — Home button (native Home)

**Higher risk; get explicit approval at each step.** The tracked helper in [scripts/native-home/](../scripts/native-home/) guards on the reference model, firmware and app ID. Those guards were **left intact**. An adapted private copy was made in `.local/native-home/src/` (ignored, and backed up outside the repo).

### Changes in the private copy

| File | Change |
| --- | --- |
| `run.py` | Model guard `QA55LS03DAWXXY` → the new TV's `modelName` from port 8001 |
| `run.py` | SDB path read from `.local/signing.json` `sdk_path` (not `.local/tizen-sdk`) |
| `run.py` | Paths resolved from `.local/native-home/src/`; shell scripts pushed from there |
| `run.py` | `inspect` skips pushing the compiled helper (inspect needs only `vconftool`) |
| `run.py` | `apply`/`restore` refuse to run unless the snapshot file exists |
| `run.py` | Optional second argument picks the snapshot. Only `original.json` or `original-pre-cleanframe-boot-backup.json` are accepted |
| `Control.cs` | `Target` → `<PACKAGE_ID>.CleanFrame`; install-folder check → `/opt/usr/apps/<PACKAGE_ID>` |
| `Control.cs` | Firmware guard → `Version=<EXACT_FIRMWARE>;`. It was left as a placeholder that fails closed until `inspect` reported the real string |

Build on the Mac with Microsoft's `dotnet-install.sh` (no admin password):

```sh
bash dotnet-install.sh --channel 6.0 --install-dir "$HOME/.dotnet" --no-path   # SDK 6.0.428 here
cd .local/native-home/src && ~/.dotnet/dotnet build -c Release -o ../out
```

### Sequence used

1. **Inspect (read-only):** `python3 .local/native-home/src/run.py inspect`. It confirmed UID 901, `armv7l`, the exact firmware line in `/etc/prd_info.ini`, .NET runtime 6.0.9, the three native libraries and non-empty original values. Stop if any differ.
2. **Query and save originals once:** `run.py query`, then write the JSON line to `.local/native-home/original.json`, mode 400. Copy it, `out/`, `src/` and a `RECOVERY.md` to a folder outside the repo.
3. **Apply:** `run.py apply`. Read back the values, then the owner pressed Home from YouTube/HDMI: CleanFrame opened.
4. **Restore:** `run.py restore`. The readback matched the snapshot exactly, and the owner pressed Home: Samsung Home opened.
5. **Re-apply:** see the trap below. Home opened CleanFrame again.

### Values on this TV

| Setting | Original | After re-apply |
| --- | --- | --- |
| Home operation (`aul` main) | `com.samsung.tv.csfs` | `<APP_ID>` |
| `db/appfw/home_appid` | `com.samsung.tv.csfs` | `<APP_ID>` |
| `db/appfw/startup_appid` | `org.tizen.tv-viewer` | `org.tizen.tv-viewer` |
| `db/appfw/booting_appid_backup` | `org.tizen.tv-viewer` (dynamic, see below) | `org.tizen.tv-viewer` |
| `db/first_screen/type` | `com.samsung.tv.csfs` | `com.samsung.tv.csfs` |
| `db/menu/smart_hub/ontvsetting/auto_start` | `0` | `1` |

The helper writes only the first, second and last rows. On the **first** apply, the TV itself changed `startup_appid` to CleanFrame as well. On the re-apply it stayed at `org.tizen.tv-viewer`. This TV started on the last input before the change, so power-on probably still does. That isn't confirmed.

### The boot-backup trap

`db/appfw/booting_appid_backup` tracks the **last app opened**. It read `org.tizen.tv-viewer` in the inspect, then `<APP_ID>` minutes later in the query, after CleanFrame had been opened. The helper's apply refuses if any saved value differs from the snapshot. After the restore test, opening Samsung Home and the input changed it back, and the re-apply was **refused before any write**:

```
System.Exception: Setting changed since snapshot: db/appfw/booting_appid_backup
```

That refusal is the intended safe failure. Don't retry blindly; run `query` first. The current state matched the `tv-viewer` variant exactly. That variant was kept from the inspect as `original-pre-cleanframe-boot-backup.json`, mode 400, so the re-apply ran against it:

```sh
python3 .local/native-home/src/run.py apply original-pre-cleanframe-boot-backup.json
```

**On a new TV:** save both observed variants. Don't open any app between the last query and apply. Prefer the variant whose boot backup points at a system app rather than CleanFrame, so a later restore never leaves the TV pointing at a missing app.

### Restore

```sh
python3 .local/native-home/src/run.py restore original-pre-cleanframe-boot-backup.json
```

Restore **before** uninstalling CleanFrame or changing its app ID. After a firmware update, the firmware guard refuses every action, including restore. Review before changing the guard.

## Afterwards

- **Certificate expiry (one year).** The signature is checked at install time, so the installed app is expected to keep running after expiry, though this wasn't verified. Reinstalling or updating needs renewed certificates.
- **Firmware updates** are the larger risk. They can remove the app, reset Home or block the transport. Turning off **Settings → Support → Software Update → Auto Update** keeps the setup stable, at the cost of missing Samsung's security fixes.
- **Factory reset** removes CleanFrame and restores Samsung Home.
- **Keep the recovery folder and certificate backup** off the Mac.

## Checklist for the next TV

- [ ] Model, full firmware string and IP recorded; IP reserved in the router
- [ ] Developer Mode on with the Mac's IP; TV restarted
- [ ] Identity checked through port 8001 before `sdb connect`
- [ ] `capability` shows Tizen ≥ 6.5 (and 32-bit, .NET 6 for the Home helper)
- [ ] Distributor certificate covers the new TV's DUID
- [ ] `npm run check`, `npm run package`, `npm run tv:install`, `npm run tv:launch`; CleanFrame seen on screen
- [ ] Shortcuts set in **Apps on Home**; `org.tizen.tv-viewer` probed for TV input
- [ ] Private helper copy adapted (model, firmware after inspect, target, folder) and built
- [ ] Inspect → query → save both snapshots → back up outside the repo
- [ ] Apply → physical Home check → restore → physical check → re-apply → physical check
- [ ] Power-on and the Samsung Home escape checked, or recorded as untested
