# Building Quill on Linux (CachyOS / Arch)

This guide covers building the release binary and packages (deb, rpm) on Arch-based systems. AppImage is not built by default because linuxdeploy often fails on Arch (permission errors in `/usr/lib`). To produce an AppImage, build on Ubuntu or in an Ubuntu-based Docker/CI environment.

## 1. Install build dependencies

```bash
sudo pacman -S --needed base-devel webkit2gtk-4.1 librsvg
```

- **base-devel** – compiler and build tools  
- **webkit2gtk-4.1** – webview used by Tauri  
- **librsvg** – SVG rendering (icons, UI)

If the build fails with missing libraries, add only what the error asks for (e.g. `openssl`, `libappindicator-gtk3`). Optional: `appmenu-gtk-module` for app menu integration.

## 2. Install Tauri CLI (if needed)

```bash
cargo install tauri-cli --locked
```

## 3. Build

From the project root:

```bash
cargo tauri build
```

Outputs:

- **Binary:** `target/release/quill`
- **DEB:** `target/release/bundle/deb/Quill_0.1.0_amd64.deb`
- **RPM:** `target/release/bundle/rpm/Quill-0.1.0-1.x86_64.rpm`

## 4. Run

```bash
./target/release/quill
```

On Debian-based systems you can install the .deb with `sudo dpkg -i …`. On Arch you can run the binary as above or convert the .deb with `debtap` if you want a system package.

## Notes

- First build after a clean `target/` can take several minutes while dependencies compile.
- Binaries built on CachyOS/Arch run best on current Arch-based distros; for wider compatibility, build on an older or Ubuntu-based system.
