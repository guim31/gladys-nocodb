# NocoDB

Deine NocoDB-Tabellen in Gladys: wie viele Zeilen eine Tabelle oder Ansicht
enthält, ein Feld ihrer ersten Zeile, ein Szenenauslöser, wenn eine Zeile
hinzugefügt wird, und Zeilen, die aus deinen Szenen hinzugefügt oder geändert
werden. NocoDB ist eine freie, selbst gehostete Alternative zu Airtable.

Getestet mit einem echten NocoDB 2026.10.2 (Docker, SQLite): verfolgte Tabelle
und Ansicht, durch die Szenenaktionen hinzugefügte und geänderte Zeilen, erkannte
neue Zeilen, falsches Token, gelöschte Tabelle, gestoppter Server. Rückmeldungen
und Fehlerberichte sind auf
[GitHub](https://github.com/guim31/gladys-nocodb/issues) willkommen.

## Was du bekommst

- **Ein Gerät pro verfolgter Tabelle**: ihre Zeilenzahl oder die Zeilenzahl
  einer ihrer Ansichten (deren Filter: „offene Aufgaben“, „offene Tickets“…).
- Optional **ein Feld der ersten Zeile der Ansicht** (deren Sortierung:
  „nächste Aufgabe“, „letzter Messwert“), als Zahl, Ja/Nein oder Text.
- Zwei **Szenenauslöser**: „Neue NocoDB-Zeile“ und „NocoDB-Zeilen über einer
  Schwelle“.
- Zwei **Szenenaktionen**: „NocoDB-Zeile hinzufügen“ und „NocoDB-Zeile ändern“.
- Ein **Dashboard-Widget**, „NocoDB-Tabellen“, mit jeder verfolgten Tabelle.

## Voraussetzungen

- NocoDB (eine Version ab 2024, API v2), von Gladys aus über das Netzwerk
  erreichbar: nicht `localhost`, die Integration läuft in ihrem eigenen
  Container. NocoDB Cloud (`https://app.nocodb.com`) funktioniert auch.
- Ein **API-Token**: in NocoDB unter Kontoeinstellungen → Tokens → Token
  erstellen. Das Token hat die Rechte seines Benutzers: Ein Benutzer mit der
  Rolle „Viewer“ in einer Base kann dort nicht schreiben (die Szenenaktionen
  schlagen dann mit dem Grund fehl).

## Konfiguration

- **Adresse**: die Adresse von NocoDB, von Gladys aus gesehen, mit Port, z. B.
  `http://192.168.1.20:8080`. Ein Pfad bleibt erhalten
  (`https://example.org/nocodb`).
- **API-Token**: das oben erstellte Token. Es wird nie in die Protokolle
  geschrieben.
- **Aktualisierungsintervall**: 30 Sekunden bis 15 Minuten (standardmäßig
  1 Minute). Jede Tabelle wird mit zwei oder drei Anfragen pro Intervall
  gelesen.
- **Sprache der Meldungen**: die Namen der neuen Funktionen und die Meldungen
  der Szenenaktionen.

„Verbindung testen“ listet die Tabellen, die das Token sieht („Base / Tabelle“),
liest die verfolgten Tabellen und sagt, was nicht stimmt.

## Tabellen verfolgen

Nutze „Tabelle verfolgen“ in der Konfiguration der Integration:

- **Tabelle**: ihr Name, `Base / Tabelle`, falls mehrere Bases eine Tabelle
  dieses Namens haben, oder ihre ID (in NocoDB: Menü der Tabelle → Tabellen-ID
  kopieren).
- **Ansicht** (optional): Gezählt werden die Zeilen der Ansicht, mit deren
  Filtern. Ohne Ansicht werden alle Zeilen der Tabelle gezählt.
- **Feld** (optional): zeigt auch dieses Feld der ersten Zeile der Ansicht.
  Zahl-, Dezimal-, Währungs-, Prozent-, Bewertungs-, Dauer-, Rollup- und
  Zählfelder liefern eine Zahl; ein Kontrollkästchen liefert Ja/Nein; jedes
  andere Feld einen Text.
- **Schwellenwert** (optional): eine Zeilenzahl für den Auslöser
  „NocoDB-Zeilen über einer Schwelle“.
- **Name** (optional): der Name des Geräts.

Füge das Gerät dann im Tab „Entdecken“ der Integration hinzu. Dieselbe Tabelle,
Ansicht und dasselbe Feld erneut ändern den Namen oder den Schwellenwert.
„Tabelle nicht mehr verfolgen“ nimmt dieselbe Tabelle, Ansicht und dasselbe
Feld; ihr Gerät bleibt in Gladys, bis du es löschst. Höchstens 30 Tabellen
können verfolgt werden.

## Geräte

- **Zeilen**: die Zeilenzahl der Tabelle oder der Ansicht.
- **Das verfolgte Feld**, falls vorhanden, nach dem Feld benannt.

Die Integration liest NocoDB mit einem eigenen Timer (Gladys fragt diese Geräte
nicht ab) und sendet einen Wert nur, wenn er sich ändert.

## Szenen

### Auslöser

- **Neue NocoDB-Zeile**: eine Zeile, die einer verfolgten Tabelle hinzugefügt
  wurde (ihrer Ansicht, falls eine gewählt wurde: Eine Zeile, die deren Filter
  nicht erfüllt, ist für sie nicht neu). Variablen: die Tabelle, die ID der
  Zeile, ihr Anzeigewert und die ganze Zeile als JSON. Zeilen, die von den
  Szenenaktionen dieser Integration hinzugefügt wurden, lösen ihn nicht aus
  (keine Schleife). Die Zeilen, die beim Verfolgen schon da sind, sind nicht
  neu. Braucht eine Tabelle mit numerischer ID, die jede in NocoDB erstellte
  Tabelle hat.
- **NocoDB-Zeilen über einer Schwelle**: Die Zeilenzahl übersteigt den mit
  „Tabelle verfolgen“ gesetzten Schwellenwert. Er löst einmal pro
  Überschreitung aus: Die Zahl muss auf den Schwellenwert oder darunter
  zurückgehen, bevor er erneut auslöst. Variablen: die Tabelle, die Zeilenzahl,
  der Schwellenwert.

Der Tabellenfilter beider Auslöser ist optional: leer, jede Tabelle.

### Aktionen

- **NocoDB-Zeile hinzufügen**: fügt einer verfolgten Tabelle eine Zeile hinzu.
  Die ID der Zeile ist eine Ausgabe für die folgenden Aktionen.
- **NocoDB-Zeile ändern**: ändert Felder einer Zeile einer verfolgten Tabelle,
  über ihre ID (z. B. die ID-Variable von „Neue NocoDB-Zeile“).

Die Werte schreibst du als `Feld=Wert; Anderes=Wert` (getrennt durch `;` oder
Zeilenumbrüche) oder als JSON: `{"Feld": "Wert", "Betrag": 3}`. Szenenvariablen
gehen in beiden. Ein Kontrollkästchen akzeptiert `true`/`false`, `ja`/`nein`,
`1`/`0`; eine Zahl akzeptiert ein Komma. Ein Feld, das die Tabelle nicht hat
oder das NocoDB selbst ausfüllt (ID, Erstellungszeit, Formel…), wird mit seinem
Namen abgelehnt: NocoDB würde es stillschweigend verwerfen. Ein Wert, den NocoDB
ablehnt (ein Text in einem Zahlenfeld), schlägt mit dessen Meldung fehl.

## Dashboard

Das Widget „NocoDB-Tabellen“ zeigt eine Zeile pro verfolgter Tabelle: ihre
Zeilenzahl oder das verfolgte Feld. Die angezeigten Tabellen sind wählbar (nur
die in Gladys angelegten Geräte), und seine Schaltfläche „Aktualisieren“, die
alle Tabellen sofort liest, lässt sich ausblenden.

## Grenzen

- Nur die verfolgten Tabellen werden gelesen, nie eine ganze Base.
- Eine neue Zeile ist eine Zeile, deren ID über der zuletzt gesehenen liegt:
  Eine Tabelle einer externen Datenbank mit Text-Schlüssel löst „Neue
  NocoDB-Zeile“ nicht aus.
- Höchstens 10 neue Zeilen pro Tabelle werden pro Lesevorgang gemeldet; die
  weiteren beim nächsten.
- NocoDB Cloud begrenzt die API auf 5 Anfragen pro Sekunde und Benutzer: Die
  Tabellen werden nacheinander gelesen, weit darunter.
- Nur die API v2 von NocoDB: sehr alte Versionen (vor 2024) werden nicht
  unterstützt.

## Fehlerbehebung

- **„NocoDB lehnt das API-Token ab“**: Das Token wurde widerrufen oder sein
  Benutzer hat den Zugriff auf die Base verloren. Erstelle ein neues.
- **„NocoDB ist nicht erreichbar“**: Prüfe die Adresse von dem Rechner aus, auf
  dem Gladys läuft (nicht `localhost`), und den Port (standardmäßig 8080).
- **„Diese Adresse antwortet nicht wie NocoDB“**: Die Adresse führt zu einem
  anderen Webserver, oder der Pfad eines Reverse-Proxys fehlt.
- **Eine Tabelle zeigt „Fehler“ im Widget**: Die Tabelle wurde gelöscht, oder ihre
  Ansicht; „Verbindung testen“ nennt sie. Verfolge sie erneut.
- Ausführliche Protokolle: `LOG_LEVEL=debug` am Container.
