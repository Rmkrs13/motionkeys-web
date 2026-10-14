# MotionKeys (Chrome-extensie)

Chrome-extensie die via de webcam je lichaam volgt en toetsen stuurt naar een browserspel
(bv. een dino-kloon of Subway Surfers op het web). Werkt op macOS en Windows.

| Beweging | Toets (standaard) |
|---|---|
| Springen | spatie |
| Bukken | ↓ (vasthouden) |
| Stap naar links | ← (één tik; na elke stap wordt waar je stilstaat de nieuwe referentie) |
| Stap naar rechts | → (idem) |

Alles zit in het **zijpaneel van Chrome** (klik op het icoon): bovenaan het gespiegelde camerabeeld met groene dots
op je gewrichten en de links/rechts-drempels (die met je meeschuiven), daaronder de bewegingstekst en de status,
**Start/Stop** en **Kalibreer**, en alle instellingen. Het spel kan in volledig scherm terwijl het zijpaneel ernaast
blijft staan. De bewegingstekst (SPRONG, ← LINKS, …) verschijnt desgewenst ook kort bovenaan in het spel zelf
(schakelaar *Bewegingen tonen bovenaan in het spel*).
**Kalibreer** meet je referentiepositie opnieuw (midden, heuphoogte en romphoogte); bij Start, na verlies van tracking
en als je stil buiten het bereik van de baseline staat gebeurt dit automatisch.

Dit is de herschrijving van de macOS-app [Rmkrs13/motionkeys](https://github.com/Rmkrs13/motionkeys)
(Swift, Vision, CGEvent) naar het web: pose-detectie met [MediaPipe Pose Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker/web_js)
(WASM/WebGL, lokaal gebundeld), dezelfde bewegingsherkenning, toetsen via een content script.

## Beperkingen van een extensie

- Toetsen gaan **alleen naar een browsertabblad**, niet naar andere programma's. Het spel moet dus in Chrome draaien.
- `chrome://dino` (het offline-dino-spel) is **niet** bereikbaar: extensies mogen niets doen op chrome://-pagina's
  en in de Chrome Web Store. Web-klonen zoals [chromedino.com](https://chromedino.com) werken wel.
- Sommige spellen negeren synthetische toetsen (`isTrusted === false`). Zet dan **Betrouwbare toetsen** aan
  in de instellingen (zie onder).

## Bouwen en installeren

```sh
npm install
npm run build        # bouwt dist/ (downloadt eenmalig het pose-model, ±6 MB)
npm run dev          # bouwt opnieuw bij elke wijziging
npm test             # Vitest: de gesture-engine op synthetische bewegingen
npm run typecheck
```

Daarna in Chrome: `chrome://extensions` → **Ontwikkelaarsmodus** aan → **Uitgepakte extensie laden** → kies de map `dist/`.
Pin het icoon in de werkbalk; een klik opent het zijpaneel.
Na een nieuwe build klik je daar op het herlaad-icoon van de extensie (anders blijft de oude service worker draaien). Vereist Chrome 116 of nieuwer (ook op Windows).

## Gebruik

1. Open het spel in een gewoon tabblad en klik erin (zodat het de toetsen ontvangt).
2. Klik op het MotionKeys-icoon in de werkbalk: het zijpaneel opent. Klik **Start**;
   Chrome vraagt één keer toestemming voor de camera.
3. Ga in het midden van het beeld staan en sta ±1 s stil (kalibratie).
4. Stap opzij voor ←/→, spring voor spatie.

De toetsen gaan standaard naar het **actieve tabblad** van het venster. Onder *Spel* kun je in plaats daarvan een
vast tabblad kiezen. Het paneel waarschuwt als het doel een
chrome://-pagina is of niet meer bestaat.

## Permissies

| Permissie | Waarom |
|---|---|
| Camera | wordt gevraagd bij de eerste Start, in het paneelvenster |
| `storage` | instellingen bewaren |
| `tabs`, host `<all_urls>`, `scripting` | het spel-tabblad vinden en er het content script in laden dat de toetsen aflevert |
| `sidePanel` | het paneel in het zijpaneel van Chrome tonen |
| `debugger` | voor **Betrouwbare toetsen**; Chrome laat deze permissie niet optioneel toe, dus ze staat vast in het manifest. Ze wordt alleen gebruikt als je die optie aanzet |

Toegankelijkheidsrechten (zoals de macOS-app nodig had) zijn niet nodig.

## Modi en toetsen

In het zijpaneel kies je een modus (preset) of stel je per beweging de toets en de manier in:

| Beweging | Herkenning |
|---|---|
| Springen | dip vóór de afzet (anticipatie) of snelle afzet (heupen/schouders > 1.5 romphoogte/s omhoog; strenger na een landing, buk of stap), of als vangnet de hoogte-route: heupen én schouders al > 0.08 romphoogte boven de baseline en nog stijgend met > 1.1 romphoogte/s |
| Bukken | heupen of schouders > 0.4 × romphoogte onder de baseline, of > 0.3 gedurende 0,15 s (niet tijdens een stap of vlak na een landing) |
| Stap links / rechts | zijwaartse beweging > 0.35 romphoogte/s die al in het vorige frame bezig was (geen glitch), of trage stap > 0.3 × romphoogte t.o.v. je laatste rustpositie; na elke stap wordt waar je stilstaat de nieuwe referentie, en een grote stap (≥ 0.9 romphoogte, een gewone stap is 0.3–0.8) telt als twee |

- **Tik**: korte toetsaanslag (key down, 40 ms later key up) bij het begin van de beweging.
- **Vasthouden**: toets ingedrukt zolang de beweging duurt (bukken in het dino-spel, of een stap opzij die je
  aanhoudt). Bij Stop, Kalibreer, een wijziging of het sluiten van het paneel worden ingedrukte toetsen losgelaten.
- Modi: *Dino snel* (spatie, anticipatie, geen bukken), *Dino met bukken*, *Subway Surfers*
  (↑ springen, ↓ rollen als tik, ← → van baan wisselen), *Pijltjes*, *WASD*.
- Sprong-anticipatie staat automatisch uit zodra bukken een toets heeft: de dip vóór een sprong
  is anders niet te onderscheiden van beginnen te bukken. De sprong wordt dan bij de afzet zelf
  gestuurd (±250 ms later).
- Gevoeligheid per beweging (springen, bukken, opzij) als schuiver van 50 % tot 200 %: schaalt de drempels hieronder (100 % = de gemeten standaard).
- **Toetslevering**: *Synthetische toetsen* (standaard) dispatcht `KeyboardEvent`s via een content script; geen
  waarschuwingsbalk, werkt voor de meeste spellen. *Betrouwbare toetsen* gebruikt `chrome.debugger`
  (`Input.dispatchKeyEvent`): echte toetsaanslagen met `isTrusted === true`, maar Chrome toont dan tijdens het
  tracken de balk "MotionKeys heeft foutopsporing gestart in deze browser". Klik je daar op *Annuleren*, dan valt
  de extensie terug op synthetische toetsen.
- **Bewegingen tonen bovenaan in het spel**: de bewegingstekst als popover (top layer, dus ook boven een spel in
  volledig scherm) bovenaan de spelpagina, via het content script.
- Instellingen staan in `chrome.storage.local` (`keyMapping`, `sensitivity`, `cameraId`, `keyDelivery`, `showOverlayInGame`) en worden
  live toegepast, ook terwijl je trackt.

## Camera kiezen

Onder *Camera* in het zijpaneel staat een camerakeuze: automatisch (standaardcamera) of een USB-webcam. USB-camera's
verschijnen zodra ze aangesloten zijn ("Vernieuwen" als dat niet vanzelf gebeurt; namen zijn pas zichtbaar nadat de
camera één keer toegestaan is). Wisselen kan tijdens het tracken; de extensie kalibreert dan opnieuw. De extensie
vraagt 640×480 en bij voorkeur 60 fps (minder vertraging).

## Hoe een sprong gemeten wordt

Bij de kalibratie (±1 s stilstaan) onthoudt de engine je heup- en schouderhoogte en je romphoogte *h*
(schouders → heupen). Alles daarna is in veelvouden van *h*, zodat de afstand tot de camera niet uitmaakt. Een sprong
kan via drie routes, in volgorde van snelheid:

1. **Dip**: heupen én schouders zakken sneller dan 0.6 *h*/s terwijl je net nog stilstond. De toets gaat dan al
   ±250 ms vóór de afzet. Alleen actief als *Sprong anticiperen* aan staat **en bukken geen toets heeft**
   (de modus *Dino snel*); met bukken aan zou elke buk een sprong zijn.
2. **Afzet**: heupen óf schouders stijgen over de laatste 2 frames (±66 ms) sneller dan 1.5 *h*/s
   (2.2 kort na een landing, tijdens een buk of een stap opzij).
3. **Hoogte** (vangnet): heupen én schouders zitten al > 0.08 *h* boven de baseline en stijgen nog > 1.1 *h*/s.
   MediaPipe vlakt landmarks af, waardoor een afzet trager "lijkt" dan hij is; zonder deze route stond de engine dan
   wel "in de lucht" maar verstuurde geen toets.

In de console van het paneel wordt elk frame met een stijgsnelheid > 0.8 *h*/s gelogd (`vHip`, `vSh` in *h*/s). Haalt
een echte sprong bij jou maar 1.0–1.4, zet dan de gevoeligheid *Springen* hoger (150 % deelt alle drempels door 1.5),
of kies *Dino snel* voor de dip-anticipatie. Onderaan het paneel staan de gemeten framerate en pose-tijd; onder
±25 fps worden snelheden over een langer venster gemeten en dus lager.

## Automatisch herkalibreren

- Verlies van het lichaam (> 1 s geen pose) → status *Geen lichaam gevonden*; zodra je weer in beeld bent start de
  kalibratie vanzelf opnieuw (±1 s).
- Sta je ≥ 1,5 s stil terwijl de baseline duidelijk niet meer past (romphoogte > 25 % anders, heupen én schouders
  > 0.5 *h* boven of onder de baseline, of de engine denkt nog "in de lucht" te zijn na een gemiste landing), dan
  herkalibreert de engine zelf. Kleine verschuivingen (gebogen speelhouding, iets dichter bij de camera) volgt de
  baseline al zonder herkalibratie.
- **Kalibreer** blijft beschikbaar om het meteen te doen.

## Gevoeligheid aanpassen

Alle drempels staan in `src/engine/gesture-engine.ts` in `class Thresholds`,
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
- `duckEnter` (0.4), `duckSlowEnter` (0.3) / `duckSlowHold` (0.15 s), `duckExit` (0.15): bukken (alleen actief met een toets). Tijdens een buk wordt geen sprong herkend, en na het rechtkomen pas weer zodra je stilstaat (`duckRecoverTimeout` 1 s als bovengrens). Zolang je opzij beweegt geldt `jumpVelocityAfterLanding`: een wippende stap is geen sprong.
- `jumpCooldown` (0.25 s): minimale tijd tussen twee sprongen.
- `jumpOnDip` (true): stuurt de spatie al bij de dip (door de knieën zakken) vlak vóór de afzet, ±150–250 ms eerder. Compenseert de cameravertraging. Nadeel: snel bukken telt ook als sprong. Zet op `false` om dit uit te schakelen.
- `dipVelocity` (0.6): hoe snel je moet zakken om als dip te tellen.
- `jumpVelocityAfterLanding` (2.2) en `landingStrict` (0.6 s): na een landing (heupen eerst boven `jumpEnter`, dan terug onder `jumpExit`) geldt deze strengere afzetdrempel en staat de dip-anticipatie uit. De veer na het neerkomen haalt ±1.7 romphoogte/s, een echte tweede afzet 3+, dus een snelle dubbele sprong komt wel door (zonder anticipatie: de dip ervoor is niet te onderscheiden van de landing).
- `pendingTimeout` (0.6 s): na een verstuurde spatie wacht de app op de afzet; komt die niet (valse dip), dan staat hij daarna weer klaar. Tijdens de sprong zelf wordt niets meer verstuurd.

## Vertraging

In de console van het paneel (rechtsklik → Inspecteren) logt de extensie per beweging en elke 60 frames
`camera→app`, `pose` en `totaal` in ms, plus het meetspoor van de engine. Pose-detectie op de GPU kost
doorgaans 10–30 ms; de camerapijplijn zelf blijft de grootste factor. Een USB-webcam met 60 fps helpt.
Voor nog vroegere anticipatie: `dipVelocity` verlagen naar 0.5 (gevoeliger voor valse tikken).

In de console is `window.__motionkeys.controller` beschikbaar om te testen, bv.
`__motionkeys.controller.perform({ action: 'jump', phase: 'start' })` stuurt de sprongtoets naar het spel-tabblad.

## Structuur

```
manifest.json                 MV3: zijpaneel via actie-icoon, content script op <all_urls>, debugger-permissie
build.mjs                     esbuild (3 bundels) + kopieert manifest, html/css, iconen, model en MediaPipe-WASM naar dist/
public/icons/                 extensie-iconen
public/models/                pose_landmarker_lite.task (gedownload bij de eerste build)
src/
  engine/types.ts             PoseFrame, gewrichtsnamen, GestureEvent, EngineStatus
  engine/gesture-engine.ts    Thresholds, BodyMetrics, kalibratie + state machine → events (1:1 met de macOS-versie)
  engine/key-mapping.ts       bewegingen, toetsen, tik/vasthouden, modi (presets), gevoeligheid
  pose/pose-detector.ts       MediaPipe Pose Landmarker → PoseFrame (y omgekeerd naar origin linksonder)
  pose/camera.ts              getUserMedia, camerakeuze
  keys/key-codes.ts           toets → key/code/keyCode(/tekst), berichten naar het content script (toets, bewegingstekst)
  keys/key-sender.ts          ContentScriptSender (chrome.tabs.sendMessage) en DebuggerSender (chrome.debugger)
  content.ts                  content script: dispatcht KeyboardEvents in het frame dat focus heeft; toont de bewegingstekst als popover
  settings.ts                 instellingen in chrome.storage.local, sessiestatus in chrome.storage.session
  background.ts               service worker: zijpaneel aan het icoon koppelen, spel-tabblad onthouden, opruimen
  panel/                      zijpaneel: tracking-controller (camera → pose → engine → toetsen), overlay, UI, instellingen (settings-ui.ts)
test/gesture-engine.test.ts   Vitest: kalibratie, sprong (afzet en dip), stappen, doorschuiven, glitch, bukken, body lost
```
