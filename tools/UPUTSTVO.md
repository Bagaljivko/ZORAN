# Makro `zoran-svojstva.bas` — kratko uputstvo

Makro upisuje parametre zupčanika u **Custom Properties** (kartica *Custom* u *File › Properties*) otvorenog dela u SolidWorks-u, pod imenima koja Zoran traži pri uvozu:

| Svojstvo | Značenje |
|---|---|
| `ZORAN_Modul` | modul mₙ [mm] |
| `ZORAN_BrojZuba` | broj zuba z |
| `ZORAN_UgaoNagiba` | ugao nagiba β [°] (0 za prave zube) |
| `ZORAN_UgaoProfila` | ugao profila αₙ [°] |
| `ZORAN_Sirina` | širina zahvata b [mm] |
| `ZORAN_PomeranjeProfila` | pomeranje profila x·mₙ [mm] |

## Pokretanje

1. Otvori deo zupčanika (`.SLDPRT`).
2. **Tools › Macro › Run…**, izaberi `zoran-svojstva.bas` (ako SolidWorks traži `.swp`, napravi novi makro preko **Tools › Macro › New**, u VBA editoru izaberi **File › Import File…** i uvezi ovaj `.bas`, pa sačuvaj kao `.swp`).
3. Za svako svojstvo pojavi se prozor sa trenutnom vrednošću. Unesi broj (tačka ili zarez) ili pritisni *Cancel* da ga preskočiš.
4. **Sačuvaj deo (Ctrl+S).** Bez čuvanja svojstva nisu u fajlu.
5. U Zoranu otvori **Uvoz**, izaberi fajl, proveri podatke i pritisni **Primeni u proračun**.

Napomena: fajl je sačuvan u kodnoj strani Windows-1250 (srpska latinica u porukama) i sa CRLF prelomima, kako ga očekuje VBA editor.
