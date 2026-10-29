' Runs a command with no window at all (Task Scheduler + powershell.exe would flash a console).
CreateObject("WScript.Shell").Run WScript.Arguments(0), 0, False
