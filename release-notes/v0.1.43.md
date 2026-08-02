# Inix v0.1.43

### Enhanced Update Experience

In this update, we've made significant improvements to the update experience, including better handling of silent errors and more detailed feedback.

## Improvements
### Installer Assets Generation
Our installer now checks if an icon exists and generates one if necessary, ensuring a smoother installation process.

### DPAPI Decryption
The ability to decrypt many DPAPI blobs in one PowerShell invocation has been added, reducing the time it takes to import passwords from Windows profiles.

### UI Updates

- A new PNG icon has been added to our application and is now displayed by default.
- Improved accessibility for users with screen readers.
- Enhanced error messages for better user experience.

## Fixes
### Error Handling
Improved error handling during password import from CSV files.

### Vault Unlock Feedback
The vault unlock feature now displays a message when unlocking the vault for the first time, improving the overall user experience.
