' Abre el realizador sin ventanas negras: el .bat y Node van ocultos y solo se ve la ventana del panel
' (y OBS en el PC 2). Lo usa el acceso directo del escritorio: wscript Realizador.vbs pc1 | pc2 [sinpagina]
'
' Se queda esperando a que el realizador se cierre. Si al cerrarse ha dejado una actualizacion pendiente (boton
' "Actualizar" o "Volver a la anterior" del panel: .actualizacion\pendiente.json), la aplica con _aplicar.bat y lo
' vuelve a abrir, sin abrir otra ventana (la de antes se reconecta sola). Este archivo se lee entero al empezar, asi
' que se puede cambiar en la actualizacion sin problema.
'
' Solo un lanzador a la vez por PC (13/11: un segundo lanzador abierto durante una actualizacion se cruzaba con el
' primero): si ya hay otro, este solo abre la ventana del panel y se va.
Dim sh, fso, carpeta, raiz, papel, opcion, pendiente, codigo, inicio, registro, puerto
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
carpeta = fso.GetParentFolderName(WScript.ScriptFullName)
raiz = fso.GetParentFolderName(carpeta)
papel = "pc1"
If WScript.Arguments.Count > 0 Then papel = LCase(WScript.Arguments(0))
If papel <> "pc2" Then papel = "pc1"
opcion = ""
If WScript.Arguments.Count > 1 Then opcion = WScript.Arguments(1)
puerto = "4600"
If papel = "pc2" Then puerto = "4601"
pendiente = raiz & "\.actualizacion\pendiente.json"
sh.CurrentDirectory = raiz
' Todo lo que pasa al arrancar (oculto) queda en partidas\arranque-pcX.log: si algo falla, ahi se ve donde
If Not fso.FolderExists(raiz & "\partidas") Then fso.CreateFolder raiz & "\partidas"
registro = raiz & "\partidas\arranque-" & papel & ".log"

' Otro lanzador de este mismo realizador ya en marcha: solo la ventana del panel
If OtroLanzador() Then
  If opcion <> "sinpagina" Then sh.Run "cmd /c """"" & carpeta & "\_abrir-pagina.bat"" http://localhost:" & puerto & "/""", 0, False
  WScript.Quit 0
End If

Do
  If fso.FileExists(pendiente) Then
    Apuntar "--- aplicando la actualizacion pendiente"
    sh.Run "cmd /c """"" & carpeta & "\_aplicar.bat"" " & papel & " >> """ & registro & """ 2>&1""", 0, True
    ' Si el aplicador no ha podido ni empezar, que no se quede repitiendo (el panel lo dira al volver)
    If fso.FileExists(pendiente) Then
      Apuntar "--- la actualizacion no se ha podido aplicar (el aplicador no ha arrancado)"
      fso.DeleteFile pendiente, True
    End If
    opcion = "sinpagina"
  End If
  inicio = Timer
  codigo = sh.Run("cmd /c """"" & carpeta & "\realizador-" & papel & ".bat"" oculto " & opcion & " >> """ & registro & """ 2>&1""", 0, True)
  If Not fso.FileExists(pendiente) Then
    If codigo <> 0 And Abs(Timer - inicio) < 60 Then Avisar
    Exit Do
  End If
Loop

' Hay otro wscript con este mismo Realizador.vbs y el mismo PC? (WMI: la linea de ordenes de cada proceso)
Function OtroLanzador()
  Dim wmi, procesos, p, n, linea
  OtroLanzador = False
  On Error Resume Next
  Set wmi = GetObject("winmgmts:\\.\root\cimv2")
  Set procesos = wmi.ExecQuery("Select CommandLine From Win32_Process Where Name='wscript.exe' Or Name='cscript.exe'")
  n = 0
  For Each p In procesos
    linea = LCase(p.CommandLine & "")
    If InStr(linea, LCase(WScript.ScriptFullName)) > 0 And InStr(linea, " " & papel) > 0 Then n = n + 1
  Next
  If Err.Number <> 0 Then n = 0
  On Error GoTo 0
  OtroLanzador = (n > 1)
End Function

Sub Apuntar(texto)
  Dim f
  On Error Resume Next
  Set f = fso.OpenTextFile(registro, 8, True)
  f.WriteLine Now & " " & texto
  f.Close
  On Error GoTo 0
End Sub

' El realizador se ha parado nada mas empezar: se dice por que, mirando el final del registro de arranque
Sub Avisar()
  Dim texto, ultimas, motivo
  ultimas = UltimasLineas(8)
  texto = LCase(ultimas)
  If InStr(texto, "cannot find module") > 0 Or InStr(texto, "module_not_found") > 0 Or InStr(texto, "enoent") > 0 Then
    motivo = "Falta un archivo del realizador. Si tu antivirus (Kaspersky, Avast...) ha avisado o ha borrado algo, anade esta carpeta a sus exclusiones:" & vbCrLf & raiz & vbCrLf & "Despues vuelve a pasar el instalador (INSTALAR-" & UCase(papel) & ".bat)."
  ElseIf InStr(texto, "eaddrinuse") > 0 Or InStr(texto, "ocupado") > 0 Then
    motivo = "Ya habia otro realizador abierto en este PC. Usa ese (su ventana se abre desde el acceso del escritorio) o cierralo antes desde su panel (boton de los tres puntos, Cerrar el realizador)."
  Else
    motivo = "Lo ultimo que ha escrito:" & vbCrLf & vbCrLf & ultimas
  End If
  MsgBox "El realizador no ha podido arrancar." & vbCrLf & vbCrLf & motivo & vbCrLf & vbCrLf & "Registro completo: " & registro, 48, "Realizador"
End Sub

Function UltimasLineas(n)
  Dim f, todas, lineas, i, desde
  UltimasLineas = ""
  On Error Resume Next
  Set f = fso.OpenTextFile(registro, 1)
  todas = f.ReadAll
  f.Close
  On Error GoTo 0
  lineas = Split(Replace(todas, vbCr, ""), vbLf)
  desde = UBound(lineas) - n
  If desde < 0 Then desde = 0
  For i = desde To UBound(lineas)
    If Trim(lineas(i)) <> "" Then UltimasLineas = UltimasLineas & lineas(i) & vbCrLf
  Next
End Function
