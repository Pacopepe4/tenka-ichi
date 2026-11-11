' Abre el realizador sin ventanas negras: el .bat y Node van ocultos y solo se ve la ventana del panel
' (y OBS en el PC 2). Lo usa el acceso directo del escritorio: wscript Realizador.vbs pc1 | pc2 [sinpagina]
'
' Se queda esperando a que el realizador se cierre. Si al cerrarse ha dejado una actualizacion pendiente (boton
' "Actualizar" o "Volver a la anterior" del panel: .actualizacion\pendiente.json), la aplica con _aplicar.bat y lo
' vuelve a abrir, sin abrir otra ventana (la de antes se reconecta sola). Este archivo se lee entero al empezar, asi
' que se puede cambiar en la actualizacion sin problema.
Dim sh, fso, carpeta, raiz, papel, opcion, pendiente
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
carpeta = fso.GetParentFolderName(WScript.ScriptFullName)
raiz = fso.GetParentFolderName(carpeta)
papel = "pc1"
If WScript.Arguments.Count > 0 Then papel = LCase(WScript.Arguments(0))
If papel <> "pc2" Then papel = "pc1"
opcion = ""
If WScript.Arguments.Count > 1 Then opcion = WScript.Arguments(1)
pendiente = raiz & "\.actualizacion\pendiente.json"
sh.CurrentDirectory = raiz

Do
  If fso.FileExists(pendiente) Then
    sh.Run "cmd /c """"" & carpeta & "\_aplicar.bat"" " & papel & """", 0, True
    ' Si el aplicador no ha podido ni empezar, que no se quede repitiendo
    If fso.FileExists(pendiente) Then fso.DeleteFile pendiente, True
    opcion = "sinpagina"
  End If
  sh.Run "cmd /c """"" & carpeta & "\realizador-" & papel & ".bat"" oculto " & opcion & """", 0, True
  If Not fso.FileExists(pendiente) Then Exit Do
Loop
