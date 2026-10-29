# Bezpieczny wizerunek

Rozszerzenie Chrome Manifest V3 do oceny, czy aktualna strona ujawnia zdjęcia, udostępnia ich treść domenom zewnętrznym albo dopuszcza skrypty zewnętrzne do pól hasła. Interfejs jest przeznaczony dla osoby nietechnicznej: najpierw odpowiada prostym językiem, co może zagrażać prywatności i co zrobić, a dopiero później pokazuje dowody.

## Instalacja

1. Otwórz `chrome://extensions`.
2. Włącz tryb programisty (`Developer mode`).
3. Wybierz polecenie wczytania rozpakowanego rozszerzenia (`Load unpacked`).
4. Wybierz folder rozszerzenia.
5. Uprawnienie `debugger` jest wymagane, ponieważ rozszerzenie korzysta lokalnie z Chrome DevTools Protocol.

## Użycie

1. Otwórz stronę, którą chcesz sprawdzić.
2. Kliknij ikonę rozszerzenia, aby otworzyć okno przypięte do ikony.
3. Kliknij `Sprawdź stronę`.
4. Strona zostanie przeładowana, a wynik będzie aktualizowany automatycznie. Status `Skanowanie trwa` oznacza, że kolejne żądania nadal są zbierane.
5. `Zakończ skan` odłącza analizę i zachowuje wyniki. `Sprawdź ponownie` rozpoczyna skan od początku po potwierdzeniu usunięcia bieżących wyników.
6. Koło oceny jest szare przed badaniem, zielone przy braku wykrytych alarmów i czerwone po wykryciu problemu. Bursztynowy znak zapytania oznacza nieustalony dostęp do pól hasła, jeśli nie wykryto silniejszego zagrożenia. Liczba oznacza typy problemów, nie sumę wszystkich rekordów.
7. Główne podsumowanie opisuje skutek dla prywatności i podaje prosty następny krok.
8. Zakładki `Zdjęcia`, `Domeny zewnętrzne` i `Pola hasła` zawierają dowody techniczne.

Widok zdjęć pokazuje zdjęcia JPEG/JPG lub PNG z dłuższym bokiem co najmniej 200 px, których treść pobrana bez aktywnej sesji jest identyczna z treścią odpowiedzi zarejestrowanej podczas sesji. Oba formaty podlegają tym samym warunkom kwalifikacji. Taki wynik jest klasyfikowany jako brak poprawnej autoryzacji użytkownika: serwer może uwierzytelnić token w URL-u, ale nie uzależnia dostępu od potwierdzenia tożsamości i uprawnienia osoby pobierającej. Dwa kwadratowe kafelki wypełniają całą dostępną szerokość okna rozszerzenia i używają `object-fit: contain`.

Domeny zewnętrzne są grupowane po głównej domenie. Domeny tej samej strony, skrypty inline/eval/blob i zasoby browser/internal są pomijane. Skrypty zablokowane jako `ERR_BLOCKED_BY_CLIENT` pozostają w dowodach jako niewykonane lokalnie, ale potencjalnie możliwe bez blokującego rozszerzenia.

Możliwość odczytu zdjęć jest oceniana osobno dla originów kontekstów, w których wykonują się skrypty. Dodatkowe uprawnienia strony głównej wymagają potwierdzonego dostępu do jej dokumentu. Ramka odizolowana od niego może mieć własny dostęp do zdjęcia z tego samego originu lub przez CORS. Brak kontekstu, niepełne sprawdzenie i lokalna blokada skryptu dają „Dostęp do zdjęć nieustalony”; niezależnie ustalona możliwość pozostaje widoczna. Oznaczenie możliwości odczytu w grupie domeny dotyczy co najmniej jednego jej skryptu, nie wszystkich; nie jest dowodem faktycznego odczytu.

Pola `input[type=password]` głównego dokumentu są sprawdzane cyklicznie. Możliwy dostęp zewnętrznego skryptu jest oceniany według jego kontekstu wykonania: skrypt głównego dokumentu może mieć dostęp do pól, a dla pozostałych znanych kontekstów sprawdzana jest dostępność `top.document`, bez odczytywania haseł. Kontekst odizolowany nie wywołuje alarmu dotyczącego hasła dokumentu głównego. Brak kontekstu lub nieudana próba daje „Dostęp nieustalony”. Ustalona możliwość dostępu pozostaje oceniana jako krytyczna, a zaobserwowany odczyt lub zapis `input.value` jest oznaczany osobno jako mocniejszy dowód, również dla pól wewnątrz ramek. Rozszerzenie nie przechwytuje ani nie zapisuje wartości haseł.

Odpytywanie pól nie obejmuje całego Shadow DOM ani wszystkich ramek. Rozszerzenie nie podłącza osobnych targetów OOPIF; ocena kontekstów dotyczy ramek widocznych w podłączonym targecie CDP. Wynik próby dostępu opisuje chwilę sprawdzenia. Nawigacja oraz usunięcie kontekstu unieważniają jego ocenę.

## Raport RODO

Przycisk `Pobierz PDF` tworzy i pobiera wyłącznie lokalny PDF nazwany według domeny i czasu generowania. Przycisk `Pobierz komplet ZIP` pobiera jedno archiwum zawierające PDF, osobny plik JSON oraz manifest integralności SHA-256. Raport zawiera:

- prosty werdykt, poziom pilności i zalecany następny krok,
- zakres badania, adres strony, wersję rozszerzenia oraz oś czasu,
- rozdzielenie faktów potwierdzonych od technicznych możliwości,
- dowody dla każdego zdjęcia: lokalny podgląd z zebranej treści odpowiedzi, statusy HTTP, długości treści odpowiedzi, skróty SHA-256, pamięć podręczna, Google/robots.txt, CORS, identyfikatory żądań i czasy,
- wszystkie domeny zewnętrzne i skrypty, w tym rekordy `ERR_BLOCKED_BY_CLIENT`,
- pola hasła, domeny, rodzaje zdarzeń, lokalizacje w kodzie i czasy bez wartości haseł,
- opis metody i ograniczeń,
- odcisk SHA-256 aneksu dowodowego,
- osadzony w PDF plik `dowody-techniczne.json` z pełnymi metadanymi ustaleń.

Raport dokumentuje wynik techniczny. Nie zastępuje prawnej oceny naruszenia i nie rozpoznaje automatycznie, czy zdjęcie zawiera dane osobowe. Tę część musi potwierdzić człowiek.

## Uwagi techniczne

Rozszerzenie używa `chrome.debugger`, a nie `webRequest`. Nie deklaruje stałych `host_permissions` i nie wysyła danych na zewnętrzne serwery.

Dla zdjęć rozszerzenie porównuje treść oryginalnej odpowiedzi z treścią pobraną przez CDP `Network.loadNetworkResource` w ramie strony z `includeCredentials: false` i `disableCache: true`. Wynik wymaga statusów HTTP 2xx, identycznego SHA-256 i identycznej długości treści odpowiedzi. Nagłówki używane do oceny zasad pamięci podręcznej, `X-Robots-Tag` i CORS pochodzą bezpośrednio z odpowiedzi tego żądania bez aktywnej sesji.

Raport przyjmuje, że użytkownik wzrokowo zweryfikował, iż analizowane zdjęcia zawierają dane osobowe oraz że dostęp powinien być ograniczony do zidentyfikowanej i uprawnionej osoby. Wydanie identycznego pliku bez aktywnej sesji, bez powiązania dostępu z tożsamością i uprawnieniem osoby pobierającej, jest klasyfikowane jako nieprawidłowa autoryzacja `CWE-863`. Ujawnienie zweryfikowanych danych osobowych jest mapowane do `CWE-359`. Pozostałe mapowania to `CWE-525` dla pamięci podręcznej, `CWE-830` dla kodu z niezaufanego źródła, `CWE-942` dla nadmiernie otwartego CORS oraz `CWE-522` dla niewystarczającej ochrony danych uwierzytelniających.

Sprawdzenie Google opiera się na `X-Robots-Tag` i `robots.txt` originu zdjęcia. Jest to kontrola deklaratywnych blokad, a nie sprawdzenie rzeczywistej obecności pliku w indeksie Google.

Miniatury mogą używać wykrytego URL obrazu, jeżeli podgląd treści odpowiedzi nie jest dostępny. Chrome może wtedy ponownie załadować obraz z oryginalnego źródła. Podgląd nie jest używany do porównywania treści odpowiedzi.

`chrome.debugger` widzi żądania Network i zdarzenia `Debugger.scriptParsed` dopiero od chwili podłączenia. Dlatego `Sprawdź stronę` włącza wymagane domeny CDP przed przeładowaniem strony.

Klasyfikacja głównej domeny używa ograniczonej listy sufiksów, a nie pełnej Public Suffix List.

Jeżeli skan nadal trwa, kliknięcie pobierania PDF lub kompletu ZIP wyświetla pytanie, czy zatrzymać skan i przygotować raport z dotychczas zebranych wyników. Sam PDF zawiera osadzony JSON. Archiwum ZIP zawiera PDF, osobny JSON oraz odłączony manifest `integralnosc.sha256.txt` ze skrótami PDF i JSON. Manifest służy do kontroli spójności, ale nie jest podpisem cyfrowym ani zaufanym znacznikiem czasu.

## Jak czytać kod

Opisy dokumentacji, komentarze i objaśnienia JSDoc piszemy po polsku.
Nazwy funkcji, pól, typów, plików i API zachowujemy zgodnie z kodem; w tekście
zapisujemy je jako kod i wyjaśniamy ich znaczenie po polsku.

Zacznij od [przewodnika przepływu działania](docs/flows/README.md).
Pokazuje komunikację okna rozszerzenia ze skanerem, źródła renderowania i właścicieli danych.
Następnie przejdź przez [skanowanie jednego zdjęcia](docs/flows/scanning.md)
oraz [obserwację domen zewnętrznych i pól hasła](docs/flows/passwords-and-scripts.md).
[Ocena ryzyka](docs/flows/risk-assessment.md) wyjaśnia, jak ustalenia przekładają się
na liczniki, kolor i główny komunikat. Na końcu przeczytaj
[utworzenie raportu PDF/ZIP](docs/flows/report.md). Przewodniki zawierają
diagramy, przykłady danych i odnośniki do funkcji realizujących kolejne etapy.

Kod ma dwie warstwy oraz jedno miejsce ich połączenia:

| Katalog | Co zawiera |
| --- | --- |
| `src/business/` | Scenariusze działania, reguły oceny, wybór dowodów i model wyników. |
| `src/technical/` | Chrome/CDP, DOM, pomiary obrazów, timery, schowek, pobieranie i formaty plików. |
| `src/composition/` | Przekazanie konkretnych implementacji technicznych do scenariuszy biznesowych. |

Warstwa biznesowa importuje wyłącznie inne moduły biznesowe. Operacje na przeglądarce
i plikach otrzymuje jako nazwane porty, czyli zwykłe funkcje lub obiekty z metodami.
Przykładowo scenariusz wywołuje `browser.reloadPage()`, a adapter techniczny tłumaczy
to na odpowiednie polecenie CDP. Nie ma kontenera zależności ani dodatkowego szkieletu aplikacji.

### Zacznij od scenariuszy biznesowych

| Co chcesz prześledzić | Plik |
| --- | --- |
| Rozpoczęcie, zatrzymanie i odczyt skanu | `src/business/scanning/scan-flow.js` |
| Porównanie zdjęcia z wersją bez sesji | `src/business/scanning/image-comparison-flow.js` |
| Sprawdzenie zasad indeksowania | `src/business/scanning/robots-flow.js` |
| Obserwację pól hasła | `src/business/scanning/password-observation-flow.js` |
| Akcje okna rozszerzenia i odświeżanie wyników | `src/business/popup/popup-flow.js` |
| Ocenę ryzyka i liczniki | `src/business/popup/summary.js` |
| Eksport JSON/CSV i wybór danych | `src/business/popup/result-exports.js` |
| Przygotowanie i pobranie raportu | `src/business/report/export.js` |

Rozpoczęcie skanu czyta się jako kolejność etapów:

```text
rozpocznij nowy stan skanu
→ podłącz obserwację
→ przygotuj zbieranie wszystkich dowodów
→ przeładuj stronę
→ uruchom obserwację pól hasła
→ oznacz skan jako uruchomiony i zwróć wynik
```

Szczegóły etapów mają własne nazwy. Ścieżka błędu jest wydzielona w
`recoverFailedStart`, z zachowaniem odłączania obserwacji i dotychczasowych komunikatów.

Eksport raportu w `business/report/export.js` ma pięć opisanych kroków:

1. Zakończ aktywny skan po potwierdzeniu użytkownika.
2. Pobierz aktualne ustalenia.
3. Przygotuj podglądy, dowody i ich integralność.
4. Utwórz dokument oraz pliki towarzyszące i wybierz PDF lub ZIP.
5. Pobierz gotowy plik i zakończ prezentację postępu.

### Gdzie znajduje się implementacja

- `technical/background/`: polecenia i odpowiedzi CDP, zdarzenia Chrome, strumienie, monitor wstrzykiwany do strony oraz zegar i timery.
- `technical/popup/`: widoki DOM, pamięć podręczna renderowania, pomiar obrazów, komunikacja z modułem tła, schowek i zapis JSON/CSV.
- `technical/report/`: podglądy, serializacja i SHA-256, renderowanie sekcji, układ PDF, zapis PDF oraz ZIP.

`composition/background.js`, `composition/popup.js` i `composition/report.js`
pokazują, które adaptery realizują poszczególne porty. Punkty wejścia
`background.js`, `popup.js` i `report.js` uruchamiają lub udostępniają złożoną aplikację.

Stan biznesowy okna rozszerzenia zawiera aktualne wyniki i akcję użytkownika. Pamięć podręczna wymiarów
i sygnatury DOM należą do warstwy technicznej. Kafelki, liczniki i raport korzystają
z tej samej listy widocznych zdjęć. Funkcje odczytu danych raportu pobierają bieżący stan także
po operacjach asynchronicznych.

Kolejność komend CDP, pól JSON i obiektów PDF jest częścią istniejącego zachowania.
Tekst monitora pól hasła pozostaje w adapterze technicznym; jest wysyłany do strony
przez CDP, a jego stosy wywołań stanowią część interpretacji dowodów.

### Uruchomienie i pakowanie

Aplikacja używa natywnych modułów JavaScript. Nie wymaga narzędzia do łączenia modułów, kompilacji
ani bibliotek do działania. Przy kopiowaniu lub pakowaniu dołącz cały katalog `src/`,
trzy pliki wejściowe JS, `manifest.json`, `popup.html`, `popup.css` oraz `icons/`.

### Typy JSDoc

Kod pozostaje JavaScriptem uruchamianym bezpośrednio przez Chrome. Komentarze JSDoc
opisują dane, parametry, wyniki i porty; edytor korzysta z nich do podpowiedzi
i wykrywania niezgodności typów. Proste typy zmiennych są wywnioskowane z kodu.

Wspólne kontrakty znajdują się w `types/`:

- `scanning.js`: stan skanu, wyniki i porty zbierania dowodów.
- `cdp.js`: używane polecenia, odpowiedzi i zdarzenia Chrome DevTools Protocol.
- `popup.js`: sesja okna rozszerzenia, podsumowanie i jego zależności.
- `report.js`: dane raportu i kontrakty eksportu.
- `pdf.js`: elementy dokumentu i układ PDF.

Funkcje odwołują się do tych opisów przez `import()` wewnątrz komentarza JSDoc.
Nie jest to import wykonywany przez przeglądarkę. Katalog `types/` i pakiety
deweloperskie są potrzebne do sprawdzania kodu, ale nie do działania rozszerzenia.
Komentarze przy funkcjach opisują ich kontrakt; komentarze wewnątrz scenariuszy
wyjaśniają etapy lub powody mniej oczywistych decyzji.

Po zainstalowaniu Node.js 20 lub nowszego:

```sh
npm ci
npm run typecheck
```

`jsconfig.json` włącza `checkJs`, `strict` i `noEmit` dla całego kodu aplikacji.
Sprawdzanie nie generuje plików ani nie zmienia kodu uruchamianego przez Chrome.
Typy API Chrome dostarcza `@types/chrome`. JSDoc sprawdza zgodność statycznie;
nie dodaje walidacji danych podczas działania programu.
Narzędzie sprawdzające typy nie analizuje wnętrza skryptu monitora pól hasła zapisanego jako tekst
do wstrzyknięcia przez CDP; jego zgodność sprawdzają testy regresji.

## Testy zgodności z wersją sprzed refaktoryzacji

Wymagany jest Node.js 20 lub nowszy. Rozszerzenie nie wymaga instalowania Node.js;
to narzędzie tylko do uruchamiania testów przez programistę.

```sh
npm test
```

Testy używają niezmiennego punktu odniesienia w `tests/fixtures/original/`.
Porównują zachowanie obu implementacji: strukturę DOM, akcje i komunikaty okna rozszerzenia,
eksporty, serializację JSON/PDF/ZIP oraz przepływy zdarzeń Chrome/CDP. Oryginalne
pliki w katalogu danych wzorcowych nie są ładowane przez rozszerzenie. To testy z kontrolowanymi danymi
i atrapami API Chrome; nie zastępują badania konkretnej strony w prawdziwej sesji.

Dopuszczenie zdjęć PNG jest celową zmianą względem tej kopii odniesienia.
Osobne testy sprawdzają ich kwalifikację, widok i eksport; szczegóły opisuje
[przewodnik testów](tests/README.md).

Dodatkowe testy pilnują kierunku importów, braku cykli i niezależności modułów
biznesowych od przeglądarki. Scenariusze skanu, okna rozszerzenia i raportu uruchamiane są
także osobno, z prostymi zastępnikami portów technicznych.

Opcjonalne porównanie wyglądu w Chrome wymaga pakietu `playwright` i zainstalowanej
przeglądarki Chrome:

```sh
npm install --no-save --package-lock=false playwright
npm run test:visual
```

Ten test porównuje zrzuty obu wersji w siedmiu scenariuszach i zapisuje obrazy do
`tmp/readability-visual/`. Można wskazać istniejący pakiet przez
`PLAYWRIGHT_MODULE_PATH` i plik przeglądarki przez `CHROME_PATH`.
