Get-ChildItem -Path backend\src -Recurse -Filter *.js | ForEach-Object { node --check $_.FullName }
