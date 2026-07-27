Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

projectPath = fso.GetParentFolderName(WScript.ScriptFullName)
command = "cmd.exe /c cd /d """ & projectPath & """ && npm run dev"

shell.Run command, 0, False