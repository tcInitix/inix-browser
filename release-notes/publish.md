# Inix v0.1.3

This update improves error handling for updates and adds dismissible overlays to various UI elements.

## What's new

* Dismissible overlays are now available for the Update Prompt, Panic Setup, and Permission Prompts to provide a more user-friendly experience.
* Error messages in the Update Prompt have been improved with more informative and friendly language.
* The "Cannot parse releases feed" message has been added to the list of technical update dump markers.

## Improvements

* Error handling for updates has been improved with better error messages and feedback to users.

## Fixes

* Fixed an issue where the Update Prompt would not dismiss when clicking on the overlay's backdrop.
* Fixed a rare case where the update feed from GitHub was not being read correctly, resulting in an error message that could be misleading.

## Notes

We've also made some internal improvements behind the scenes to make Inix even more stable and efficient.
