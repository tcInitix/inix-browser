# Inix v0.1.2

Improve update UI to keep it human-readable.

## What's new
### Update UI improvements

Update checks now show a friendly error message when the update fails due to a server-side issue.

## Improvements
### AutoUpdater API updates

The `resolveReleaseNotes` function has been added to handle technical dump errors. This ensures that users still get helpful error messages without being exposed to raw HTTP JSON.

## Fixes
### Bug fixes

Fixed an issue with update notes not showing up properly when the release notes were a technical dump. This fix also ensures that non-technical updates are now truncated at 4000 characters as expected.

## Notes
### New feature: GitHub release body parsing

The autoUpdater now fetches and parses the release body from GitHub's API, making it easier to show actual update notes without exposing raw data to users.
