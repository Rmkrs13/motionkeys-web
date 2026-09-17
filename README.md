# MotionKeys

Kleine macOS-app die via de webcam je lichaam volgt en toetsen stuurt naar de app
op de voorgrond (bv. een game):

| Beweging | Toets |
|---|---|
| Springen | spatie |
| Stap naar links | ← (één tik; ga terug naar het midden om opnieuw te tikken) |
| Stap naar rechts | → (idem) |

Een zwevend venster (altijd bovenop, steelt geen focus) toont het gespiegelde camerabeeld,
groene dots op je gewrichten, de links/rechts-drempels (die met je meeschuiven) en een boodschap bij elke beweging.
Met **Start/Stop** zet je tracking aan of uit. **Kalibreer** meet je referentiepositie opnieuw
(midden, heuphoogte en romphoogte); doe dat als je ergens anders bent gaan staan of als de
drempellijnen niet meer rond je staan. Bij Start en na verlies van tracking gebeurt dit automatisch.

## Bouwen en starten

```sh
./build.sh          # bouwt build/MotionKeys.app
./build.sh --run    # bouwt en opent de app
```

Vereist Xcode (command line tools) en macOS 14+.

## Permissies

1. **Camera** – wordt gevraagd bij de eerste keer Start.
2. **Toegankelijkheid** – nodig om toetsen te kunnen simuleren. Bij de eerste Start opent
   macOS een prompt; zet MotionKeys aan onder
   *Systeeminstellingen › Privacy en beveiliging › Toegankelijkheid*.

### Toegankelijkheid blijft niet bewaard na een rebuild?

Zonder Apple-ontwikkelaarscertificaat wordt de app *ad-hoc* gesigneerd. De handtekening
verandert dan bij elke build en macOS vergeet de Toegankelijkheid-toestemming (de app staat
nog in de lijst, maar werkt niet meer; verwijderen met **–** en opnieuw toevoegen helpt).

Eenmalige oplossing: maak een self-signed code-signing certificaat. Het snelst gaat dat met

```sh
./make-cert.sh
```

(je krijgt één wachtwoorddialoog om het certificaat te vertrouwen). Handmatig kan ook:

1. Open **Sleutelhangertoegang** › menu *Sleutelhangertoegang › Certificaatassistent › Maak een certificaat aan…*
2. Naam: `MotionKeys Dev`, Identiteitstype: *Zelfondertekend basiscertificaat*, Certificaattype: **Codeondertekening**.
3. Klik *Maak aan*. `build.sh` gebruikt dit certificaat voortaan automatisch; geef daarna de
   Toegankelijkheid-toestemming nog één keer.

Je kan ook een eigen identity forceren: `CODESIGN_IDENTITY="Apple Development: …" ./build.sh`.

## Gebruik

1. Start MotionKeys, klik **Start**, ga in het midden van het beeld staan en sta ±1 s stil (kalibratie).
2. Klik in je game zodat die de toetsen ontvangt.
3. Stap opzij voor ←/→, spring voor spatie.

## Installeren in /Applications

```sh
./build.sh --install
```

Bouwt, kopieert naar `/Applications/MotionKeys.app` en start de app. Daarna start je ze via
Spotlight (⌘-spatie, "MotionKeys"), Launchpad, of sleep ze in het Dock. De app heeft geen
Dock-icoon tijdens het draaien (accessory-app), maar een Dock-snelkoppeling werkt wel.
Het icoon staat in `Resources/AppIcon.icns` en wordt gemaakt met `swift make-icon.swift`.

## Camera kiezen

In de instellingen (tandwiel) staat bovenaan een camerakeuze: automatisch (ingebouwd), of een
USB-webcam of iPhone (Continuity Camera). USB-camera's verschijnen zodra ze aangesloten zijn
("Vernieuwen" als dat niet vanzelf gebeurt). Wisselen kan tijdens het tracken. De keuze wordt bewaard
(`cameraID`). De omgevingsvariabele `MOTIONKEYS_CAMERA` (zie onder) heeft voorrang, voor testen.

## Modi en toetsen

Klik op het tandwiel in het paneel. Daar kies je een modus (preset) of stel je per beweging
de toets en de manier in:

| Beweging | Herkenning |
|---|---|
| Springen | dip vóór de afzet (anticipatie) of snelle afzet (heupen/schouders > 1.5 romphoogte/s omhoog; strenger na een landing, buk of stap) |
| Bukken | heupen of schouders > 0.4 × romphoogte onder de baseline, of > 0.3 gedurende 0,15 s (niet tijdens een stap of vlak na een landing) |
| Stap links / rechts | zijwaartse beweging > 0.35 romphoogte/s die al in het vorige frame bezig was (geen glitch), of trage stap > 0.3 × romphoogte t.o.v. je laatste rustpositie; na elke stap wordt waar je stilstaat de nieuwe referentie, en een grote stap (≥ 0.9 romphoogte, een gewone stap is 0.3–0.8) telt als twee |

- **Tik**: korte toetsaanslag bij het begin van de beweging.
- **Vasthouden**: toets ingedrukt zolang de beweging duurt (bukken in het dino-spel, of een
  stap opzij die je aanhoudt). Bij Stop, Kalibreer of een wijziging worden ingedrukte toetsen losgelaten.
- Modi: *Dino snel* (spatie, anticipatie, geen bukken), *Dino met bukken*, *Subway Surfers*
  (↑ springen, ↓ rollen als tik, ← → van baan wisselen), *Pijltjes*, *WASD*.
- Sprong-anticipatie staat automatisch uit zodra bukken een toets heeft: de dip vóór een sprong
  is anders niet te onderscheiden van beginnen te bukken. De sprong wordt dan bij de afzet zelf
  gestuurd (±250 ms later).
- Gevoeligheid per beweging (springen, bukken, opzij) als schuiver van 50 % tot 200 %: schaalt de drempels hieronder (100 % = de gemeten standaard).
- Instellingen worden bewaard in `UserDefaults` (`keyMapping`, `sensitivity`).
- Testen: `open --env MOTIONKEYS_SETTINGS=1 build/MotionKeys.app` opent het venster meteen.

## Gevoeligheid aanpassen

Alle drempels staan in `Sources/MotionKeys/GestureEngine.swift` in `struct Thresholds`,
uitgedrukt in veelvouden van je romphoogte (schouders → heupen), zodat ze werken ongeacht
hoe ver je van de camera staat:

- `lateralEnter` (0.3): hoe ver je (traag) opzij moet stappen voor een tik, gemeten vanaf je laatste rustpositie.
- `lateralRepeat` (0.9): een stap van 0.9 romphoogte of meer telt als twee (elke 0.9 een extra tik). Gemeten gewone stappen: 0.3–0.8; verlaag naar 0.8 als je dubbele stappen kleiner zijn, maar dan tellen brede gewone stappen ook dubbel.
- `lateralSettleVelocity` (0.5) / `lateralSettleFrames` (3) / `lateralSettleTimeout` (1 s): wanneer je na een stap als stilstaand geldt; die positie wordt dan de nieuwe referentie. Snel omkeren tijdens de stap geeft meteen een tik de andere kant op. In rust volgt de referentie langzaam drijven (`lateralStillVelocity`, `lateralRefAlpha`).
- `lateralStrict` (0.4 s): tijdens en kort na een stap geen sprong onder `jumpVelocityAfterLanding` en geen "laag aanhouden"-buk (je stapt licht gebogen).
- `baselineAlpha` (0.03) / `baselineMaxShift` (0.35): de hoogte-baseline volgt in rust een gebogen speelhouding binnen 1–2 s, zodat die niet als buk telt.
- `jumpEnter` (0.08): vanaf hoe hoog je als "in de lucht" geldt (voor de landingsdetectie).
- `jumpVelocity` (1.5): hoe snel je heupen óf schouders moeten stijgen (gemeten over de laatste 2 frames, onafhankelijk van je startpositie) om bij de afzet te triggeren. Een echte afzet haalt 3–5 (gemeten), rechtkomen of een stap hooguit 1.7.
- `lateralVelocity` (0.35), `lateralMinShift` (0.03) en `lateralPriorVelocity` (0.2): een zijwaartse beweging (2-frame venster) triggert al vóór je de `lateralEnter`-afstand haalt, mits het vorige frame al dezelfde kant op bewoog. `lateralSpike` (1.5): een versnelling groter dan dit tussen twee frames is een pose-glitch (echte stappen versnellen ≤ 0.5 per frame); dat frame en het volgende triggeren niet. Omkeren tijdens een stap wordt pas na `lateralReverseFrames` (2) frames aanvaard. Tijdens en 0,6 s na een sprong vervallen glitch-filter en "vorig frame"-eis (een sprong is zelf explosief) en geldt `lateralMinShiftAirborne` (0.10). Het middelpunt zelf is de mediaan van schouders, heupen, nek en bekken, zodat één verspringend gewricht weinig invloed heeft.

## Vertraging

Gemeten op een MacBook met FaceTime HD-camera (mediaan over ±25 frames):

| Stap | Tijd |
|---|---|
| Camera → app (inherent aan de camerapijplijn) | ±140 ms |
| Vision body-pose | 20–30 ms |
| Bewegingsdetectie (1–2 frames) | 33–66 ms |
| Toetsaanslag (CGEvent) | < 1 ms |

De camera zelf is dus de grootste factor; resolutie of formaat wijzigen maakt geen verschil.
Wat wél kan helpen:

- Zet **Reacties** uit in het Bedieningspaneel (klik op het groene camera-icoon in de menubalk
  terwijl de camera aanstaat). Die gebarenherkenning zit in de camerapijplijn.
- Een externe USB-webcam met 60 fps heeft doorgaans een lagere vertraging. Kies hem met
  `MOTIONKEYS_CAMERA=<deel van de naam>` (zie hieronder).
- Verlaag `dipVelocity` naar 0.5 voor nog vroegere anticipatie (gevoeliger voor valse tikken).

Meten kan met:

```sh
/usr/bin/log stream --level info --predicate 'subsystem == "be.larslars.motionkeys"'
```

## Omgevingsvariabelen (voor testen)

Start met `open --env NAAM=waarde build/MotionKeys.app`:

| Variabele | Betekenis |
|---|---|
| `MOTIONKEYS_AUTOSTART=1` | tracking meteen starten bij het opstarten |
| `MOTIONKEYS_CAMERA=iphone` | camera kiezen op (deel van) de naam, bv. `iphone` of `logitech` |
| `MOTIONKEYS_PRESET=720p` | session preset: `vga` (standaard), `720p`, `1080p`, `high`, `low` |
| `MOTIONKEYS_FORMAT=640` | cameraformaat rechtstreeks kiezen op breedte |
| `MOTIONKEYS_FPS=0` | framerate niet forceren |
- `duckEnter` (0.4), `duckSlowEnter` (0.3) / `duckSlowHold` (0.15 s), `duckExit` (0.15): bukken (alleen actief met een toets). Tijdens een buk wordt geen sprong herkend, en na het rechtkomen pas weer zodra je stilstaat (`duckRecoverTimeout` 1 s als bovengrens). Zolang je opzij beweegt geldt `jumpVelocityAfterLanding`: een wippende stap is geen sprong.
- `jumpCooldown` (0.25 s): minimale tijd tussen twee sprongen.
- `jumpOnDip` (true): stuurt de spatie al bij de dip (door de knieën zakken) vlak vóór de afzet, ±150–250 ms eerder. Compenseert de cameravertraging. Nadeel: snel bukken telt ook als sprong. Zet op `false` om dit uit te schakelen.
- `dipVelocity` (0.6): hoe snel je moet zakken om als dip te tellen.
- `jumpVelocityAfterLanding` (2.2) en `landingStrict` (0.6 s): na een landing (heupen eerst boven `jumpEnter`, dan terug onder `jumpExit`) geldt deze strengere afzetdrempel en staat de dip-anticipatie uit. De veer na het neerkomen haalt ±1.7 romphoogte/s, een echte tweede afzet 3+, dus een snelle dubbele sprong komt wel door (zonder anticipatie: de dip ervoor is niet te onderscheiden van de landing).
- `pendingTimeout` (0.6 s): na een verstuurde spatie wacht de app op de afzet; komt die niet (valse dip), dan staat hij daarna weer klaar. Tijdens de sprong zelf wordt niets meer verstuurd.

## Structuur

```
Package.swift                 Swift Package (macOS 14+)
build.sh                      bouwt en signeert MotionKeys.app (--run / --install)
make-icon.swift               genereert Resources/AppIcon.icns
Resources/Info.plist          bundle-info, camera-usage description, LSUIElement, icoon
Resources/AppIcon.icns        app-icoon
Sources/MotionKeys/
  main.swift                  entrypoint (accessory-app, geen Dock-icoon)
  AppDelegate.swift           opent het zwevende venster, sluiten = afsluiten
  FloatingPanel.swift         NSPanel: zwevend, niet-activerend, 4:3
  CameraManager.swift         AVCaptureSession 640×480
  PoseDetector.swift          Vision VNDetectHumanBodyPoseRequest
  GestureEngine.swift         kalibratie + state machine → events
  KeySender.swift             CGEvent-toetsen (tik, indrukken, loslaten) + Toegankelijkheid-check
  KeyMapping.swift            toetsen per beweging, modi (presets), bewaren
  SettingsView.swift          instellingenvenster (gewoon NSWindow)
  TrackingController.swift    verbindt alles, publiceert state voor de UI
  OverlayView.swift           SwiftUI-overlay met beeld, dots en knoppen
```
