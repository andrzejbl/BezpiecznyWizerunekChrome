# Testy zachowania po refaktoryzacji

Wymagany jest Node.js 20 lub nowszy. Testy podstawowe nie potrzebują instalowania pakietów:

```text
npm test
```

Polecenie uruchamia dziesięć zestawów za pomocą wbudowanego mechanizmu uruchamiania testów Node.js z `--experimental-vm-modules`: `architecture.test.cjs`, `business-flows.test.cjs`, `image-context.test.cjs`, `password-context.test.cjs`, `regression.test.cjs`, `background-cdp.test.cjs`, `image-signatures.test.cjs`, `image-signatures-flow.test.cjs`, `response-body-capture.test.cjs` i `response-body-observation.test.cjs`. Ostrzeżenie Node o eksperymentalnych modułach VM jest oczekiwane.

`fixtures/original/` to niezmienna kopia sześciu plików aplikacji sprzed podziału na moduły: JavaScript, HTML, CSS i manifest. Nie jest ładowana przez rozszerzenie. Nie aktualizuj jej razem z kodem produkcyjnym: służy jako niezależny punkt odniesienia.

Dopuszczenie zdjęć PNG i WebP jest celowym wyjątkiem od zgodności z tą kopią: poprzednia
wersja pomijała PNG w widoku i eksporcie. Obecna przyjmuje je na tych samych
warunkach co JPEG/JPG. Osobne testy sprawdzają reguły kwalifikacji oraz obecność
PNG i WebP w widoku i eksporcie. W scenariuszu porównującym nieobsługiwany format z dawną
wersją używamy GIF, które obie wersje nadal pomijają. Zaktualizowane opisy
obsługiwanych formatów w oknie rozszerzenia i PDF również są zamierzoną różnicą.

Testy uruchamiają obie wersje w osobnych kontekstach i porównują:

- widoczny HTML i pełny CSS;
- DOM okna rozszerzenia, teksty, atrybuty, przyciski, zakładki i reakcje na akcje;
- dane skopiowane oraz pliki JSON i CSV;
- komunikaty rozszerzenia, komendy CDP i wyniki sekwencji zdarzeń skanowania;
- dane dowodowe, układ stron oraz pełną zawartość binarną PDF i ZIP;
- eksport podczas skanowania, w tym potwierdzenie i anulowanie.

Zegar, odpowiedzi Chrome i obrazy są kontrolowanymi danymi testowymi. SHA-256 jest obliczany rzeczywiście, ale synchronicznie wewnątrz obietnicy, aby kolejność pracy puli wątków nie powodowała losowych różnic. Te testy sprawdzają kontrakty i rezultaty aplikacji; nie łączą się z prawdziwą stroną przez Chrome DevTools Protocol.

`fixtures/findings.cjs` opisuje zdjęcie, domenę zewnętrzną, zablokowany skrypt i odczyt pola hasła. `fixtures/states.cjs` udostępnia scenariusze okna rozszerzenia. `fixtures/preview.jpg` jest lokalnym obrazem używanym do testowania osadzenia podglądu w PDF.

Dodatkowe porównanie zrzutów ekranu w Chrome uruchamia `npm run test:visual`; konfigurację opcjonalnego Playwright opisuje główny README projektu.

## Granice warstw

`architecture.test.cjs` sprawdza kierunek importów, kompletność i brak cykli zależności oraz ładowanie biznesu bez Chrome, DOM, kodowania plików i timerów.

`business-flows.test.cjs` uruchamia scenariusze skanowania, okna rozszerzenia i raportu z prostymi portami testowymi. Sprawdza m.in. kolejność przygotowania obserwacji przed przeładowaniem, zachowanie ustaleń po zatrzymaniu, anulowanie działań, świeżość danych po await i zwolnienie stanu zajętości po błędzie.


`background-cdp.test.cjs` sprawdza rzeczywisty fetch z `credentials: omit`
własnego service workera oraz pasywny odczyt odpowiedzi przez CDP: wybór targetu,
korelację żądań, kompletność body, pełne nagłówki, cleanup, timeout i limity bajtów.
Sprawdza również UTF-8 w robots.txt i oddzielny odczyt oryginalnej odpowiedzi
z targetu badanej karty. Żaden błąd nie uruchamia `Network.loadNetworkResource`.

`npm run test:integration` uruchamia `background-cdp-integration.cjs` w rzeczywistym
Chromium, na świeżym profilu i lokalnych serwerach z syntetycznymi cookies.
Wymaga Playwright/Playwright Core oraz Chromium obsługującego wczytywanie rozszerzeń.
Można podać `PLAYWRIGHT_MODULE_PATH` i `CHROME_PATH`; bez nich używany jest lokalny
moduł Playwright i jego Chromium. Test sprawdza adapter produkcyjny, uwierzytelnione
pobranie kontrolne, brak cookies i Authorization przy pobraniu przez worker,
przekierowania, zasoby bez CORS, nagłówki, porównanie zdjęć i odtworzenie połączenia
po limicie oraz timeout. Zmianę targetu workera i nieoczekiwane odłączenie sprawdzają
testy jednostkowe.
Testy kwalifikacji i eksportów obejmują także WebP.

Regresja ogólnego MIME obejmuje plik `.jpg` podawany jako `application/octet-stream`:
kwalifikację, widok, podsumowanie, eksport i zachowanie oryginalnego MIME w dowodach.
Scenariusz Chromium sprawdza ten przypadek od przechwycenia odpowiedzi, przez
porównanie z pobraniem bez sesji, po dekodowanie podglądu i kwalifikację do widoku.
Dane testowe są syntetyczne; HAR użytkowników i zdjęcia z galerii nie są kopiowane do testów.

Testy sygnatur obejmują JPEG, PNG i trzy warianty WebP, ucięte nagłówki oraz
sygnatury osadzone w innych danych. Przepływ jest sprawdzany również dla Fetch/XHR,
powtórzonego URL, zmiany metadanych, stop/restart, spóźnionych odpowiedzi i limitów.
Testy strumienia sprawdzają kolejność `bufferedData` i `dataReceived`, limity pamięci
oraz zwolnienie buforów. Chromium weryfikuje prawdziwe bajty i podglądy obrazów
bez rozszerzenia URL, także przy błędnym tekstowym MIME.

Testy obserwacji sprawdzają pasywną konfigurację natywnego kolektora i zgodność ze
starszym Chrome. Regresja wymaga braku komend `Fetch.*` podczas startu, stopu
i odłączenia. Sprawdza też synchroniczną obsługę żądań i zebranie pełnych bajtów
przy opóźnionych callbackach strumienia. Serwer integracji nie opóźnia sztucznie
odpowiedzi obrazów, więc test wykrywa wyścig szybkiej odpowiedzi z odczytem.

`npm run test:reload` uruchamia pełną aplikację rozszerzenia i jej komunikat
`startScanWithReload` na lokalnej stronie z iframe, skryptami, obrazami i fetch.
Mierzy zwykłe przeładowanie, start i ponowny start skanu oraz wymaga braku
komend `Fetch`, wstrzymanych żądań i zdarzeń `Debugger.paused`, także przy
instrukcji `debugger;` w skrypcie dokumentu i iframe. Te same zmienne `PLAYWRIGHT_MODULE_PATH`
i `CHROME_PATH` wybierają przeglądarkę. Wariant `npm run test:reload:delayed`
celowo pozostawia callbacki strumienia bez odpowiedzi, aby sprawdzić, że nie
zatrzymuje to ładowania strony. `CDP_TEST_OUTPUT` wybiera katalog wyników.

Regresja wersji 2.1.22 obejmuje uprawnienia hosta odpowiadające dostępowi po
`activeTab`: serwer musi otrzymać pusty Cookie i Authorization, także przy
przekierowaniu. Porównanie obejmuje oba warianty uprawnień, opaque body,
pełne nagłówki bez CORS oraz wolną odpowiedź po wczesnym wysłaniu nagłówków.
CORP blokujący odczyt ma dać błąd weryfikacji, nigdy potwierdzony dostęp.
