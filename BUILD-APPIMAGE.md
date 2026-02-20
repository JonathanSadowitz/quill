# Building Quill on CachyOS / Arch

**Note:** AppImage bundling often fails on Arch-based distros (linuxdeploy hits permission errors in `/usr/lib`). The config is set to build **deb** and **rpm** only so `cargo tauri build` completes. You still get the release binary at `target/release/quill` and installable packages. To build an AppImage, use an Ubuntu environment (e.g. Docker or GitHub Actions).

## 1. Install build dependencies

On CachyOS (or any Arch-based system), only these are required:

```bash
sudo pacman -S --needed base-devel webkit2gtk-4.1 librsvg
```

- **base-devel** – compiler and build tools  
- **webkit2gtk-4.1** – webview used by Tauri  
- **librsvg** – SVG rendering (icons, UI)

If the build fails with missing libraries, add only what the error asks for (e.g. `openssl`, `libappindicator-gtk3`).

Optional (for app menu integration): `appmenu-gtk-module`

## 2. Install Tauri CLI (if you don’t have it)

```bash
cargo install tauri-cli --locked
```

## 3. Build

From the **Quill project root** (where `Cargo.toml` and `src-tauri/` live):

```bash
cd /home/jon/Projects/Quill
cargo tauri build
```

This produces:

- **Binary:** `target/release/quill` (run directly)
- **DEB:** `target/release/bundle/deb/Quill_0.1.0_amd64.deb`
- **RPM:** `target/release/bundle/rpm/Quill-0.1.0-1.x86_64.rpm`

(AppImage is disabled in config because linuxdeploy fails on Arch; see note at top.)

## 4. Run the app

```bash
./target/release/quill
```

Or install the .deb (e.g. `sudo dpkg -i target/release/bundle/deb/Quill_0.1.0_amd64.deb` on a Debian-based system; on Arch you can use the binary or convert the .deb with `debtap`).

## Notes

- **Size:** The AppImage will be ~70+ MB because it bundles dependencies.
- **Compatibility:** Built on CachyOS will run best on current Arch-based distros. For older distros (e.g. Ubuntu 20.04), build on an older system or in a Docker image.
- **First build:** After a clean `target/`, the first build can take several minutes while dependencies compile.
