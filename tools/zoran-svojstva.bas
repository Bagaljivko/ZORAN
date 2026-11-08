Attribute VB_Name = "ZoranSvojstva"
' ============================================================================
'  Zoran — upis parametara zupèanika u Custom Properties (SolidWorks VBA)
'
'  Upisuje svojstva koja aplikacija Zoran traži pri uvozu .SLDPRT fajla:
'    ZORAN_Modul             modul mn [mm]
'    ZORAN_BrojZuba          broj zuba z
'    ZORAN_UgaoNagiba        ugao nagiba beta [°]
'    ZORAN_UgaoProfila       ugao profila alfa n [°]
'    ZORAN_Sirina            širina ozubljenja b [mm]
'    ZORAN_PomeranjeProfila  pomeranje profila x·mn [mm]
'
'  Upotreba: otvori deo zupèanika, Tools > Macro > Run, izaberi ovaj fajl,
'  unesi vrednosti i saèuvaj deo (Ctrl+S). Decimalni znak može biti taèka ili zarez.
' ============================================================================
Option Explicit

' Konstante iz SolidWorks API-ja (da makro radi i bez dodatnih referenci)
Private Const swDocPART As Long = 1
Private Const swCustomInfoText As Long = 30
Private Const swCustomPropertyReplaceValue As Long = 2

Dim swApp As Object

Sub main()
    Dim swModel As Object
    Dim cpm As Object

    Set swApp = Application.SldWorks
    Set swModel = swApp.ActiveDoc

    If swModel Is Nothing Then
        MsgBox "Nijedan dokument nije otvoren. Otvori deo zupèanika (.SLDPRT) i pokreni makro ponovo.", vbExclamation, "Zoran"
        Exit Sub
    End If
    If swModel.GetType <> swDocPART Then
        MsgBox "Aktivni dokument nije deo (.SLDPRT). Otvori deo zupèanika.", vbExclamation, "Zoran"
        Exit Sub
    End If

    ' "" = svojstva celog fajla (kartica Custom); njih Zoran èita iz fajla
    Set cpm = swModel.Extension.CustomPropertyManager("")

    Dim imena As Variant, opisi As Variant, podrazumevano As Variant
    imena = Array("ZORAN_Modul", "ZORAN_BrojZuba", "ZORAN_UgaoNagiba", "ZORAN_UgaoProfila", "ZORAN_Sirina", "ZORAN_PomeranjeProfila")
    opisi = Array("Modul mn [mm]", "Broj zuba z", "Ugao nagiba beta [°] (0 za prave zube)", "Ugao profila alfa n [°]", "Širina ozubljenja b [mm]", "Pomeranje profila x·mn [mm] (može biti negativno)")
    podrazumevano = Array("6.5", "16", "9", "20", "88", "0")

    Dim i As Integer, postojece As String, unos As String, upisano As String
    For i = 0 To UBound(imena)
        postojece = ProcitajSvojstvo(cpm, CStr(imena(i)))
        If postojece = "" Then postojece = CStr(podrazumevano(i))
        unos = InputBox(CStr(opisi(i)) & vbCrLf & vbCrLf & "Svojstvo: " & CStr(imena(i)) & vbCrLf & "(Cancel = preskoèi i ostavi postojeæe)", "Zoran — parametri zupèanika", postojece)
        If StrPtr(unos) <> 0 Then
            unos = Trim(Replace(unos, ",", "."))
            If unos = "" Or Not IsNumeric(Replace(unos, ".", Mid(CStr(1.5), 2, 1))) Then
                MsgBox "Vrednost """ & unos & """ nije broj — svojstvo " & CStr(imena(i)) & " nije promenjeno.", vbExclamation, "Zoran"
            Else
                cpm.Add3 CStr(imena(i)), swCustomInfoText, unos, swCustomPropertyReplaceValue
                upisano = upisano & CStr(imena(i)) & " = " & unos & vbCrLf
            End If
        End If
    Next i

    If upisano = "" Then
        MsgBox "Nijedno svojstvo nije upisano.", vbInformation, "Zoran"
    Else
        MsgBox "Upisana svojstva:" & vbCrLf & vbCrLf & upisano & vbCrLf & "Saèuvaj deo (Ctrl+S) da bi ih Zoran video u fajlu.", vbInformation, "Zoran"
    End If
End Sub

Private Function ProcitajSvojstvo(cpm As Object, ime As String) As String
    Dim vrednost As String, resena As String, ok As Boolean
    On Error Resume Next
    ok = cpm.Get5(ime, False, vrednost, resena, False)
    If Err.Number <> 0 Then
        Err.Clear
        cpm.Get2 ime, vrednost, resena
    End If
    On Error GoTo 0
    If resena <> "" Then ProcitajSvojstvo = resena Else ProcitajSvojstvo = vrednost
End Function
