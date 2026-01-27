Set WshShell = CreateObject("WScript.Shell")
' Run npm start (electron) hidden (0)
WshShell.Run "npm start", 0
Set WshShell = Nothing
