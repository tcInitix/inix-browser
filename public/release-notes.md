# Inix v0.1.42

Enhanced DPAPI Decryption and Installer Improvements

## What's new

### DPAPI Decryption

The ability to decrypt many DPAPI blobs in one PowerShell invocation has been added, reducing the time it takes to import passwords from Windows profiles.

## Improvements

*   **Improved Installer Assets Generation**: The installer now checks if an icon exists and generates one if necessary, ensuring a smoother installation process.
*   **New Icon**: A new PNG icon has been added to our application and is now displayed by default.
*   **Autofill Profiles**: Autofill profiles are created with their respective settings (e.g., Settings → Tabs), providing a better user experience.

## Fixes

*   **Vault Unlock Feedback**: The vault unlock feature now displays a message when unlocking the vault for the first time, improving the overall user experience.
