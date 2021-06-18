# You can publish if you wanna
`export CSC_LINK=~/codesigningcertificate.pfx`
`export CSC_KEY_PASSWORD=pw`

Please be sure everything works. Payment devices will break and all hell will break loose if Printdesk does not work.

- Get certifcates from password1
- Update version no in package.json
- `npm run publish`
- Goto https://github.com/servicepos/printdesk/releases and test the build
- When sure everything works: publish draft release (click edit). Printdesk will now slowly auto update.
- To rollback mark the lastest release as prerelease. Autoupdate rollback can take hours. Happy phoning! :D 

# Publish for windows
Instead of export use: 
- $Env:CSC_LINK="[full path to codesigningcertificate.pfx]"
- $Env:CSC_KEY_PASWORD="password"

Make sure to generate a GH_TOKEN and set it as an environment:
- $Env:GH_TOKEN="token"

More info can be found here on how you can generate token: https://docs.github.com/en/free-pro-team@latest/github/authenticating-to-github/creating-a-personal-access-token
Only "repo" (full contron of private repositories) needs to be checked.
