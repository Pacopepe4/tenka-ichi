' Abre el realizador sin ventanas negras: el .bat y Node van ocultos y solo se ve la ventana del panel
' (y OBS en el PC 2). Lo usa el acceso directo del escritorio: wscript Realizador.vbs pc1 | pc2
Dim sh, fso, carpeta, papel, opcion
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
carpeta = fso.GetParentFolderName(WScript.ScriptFullName)
papel = "pc1"
If WScript.Arguments.Count > 0 Then papel = LCase(WScript.Arguments(0))
If papel <> "pc2" Then papel = "pc1"
opcion = ""
If WScript.Arguments.Count > 1 Then opcion = WScript.Arguments(1)
sh.CurrentDirectory = fso.GetParentFolderName(carpeta)
sh.Run "cmd /c """"" & carpeta & "\realizador-" & papel & ".bat"" oculto " & opcion & """", 0, False
