# NocoDB

Sus tablas de NocoDB en Gladys: cuántas filas tiene una tabla o una vista, un
campo de su primera fila, un disparador de escena cuando se añade una fila, y
filas añadidas o modificadas desde sus escenas. NocoDB es una alternativa libre
y autoalojada a Airtable.

Probado contra un NocoDB 2026.10.2 real (Docker, SQLite): tabla y vista
seguidas, filas añadidas y modificadas por las acciones de escena, filas nuevas
detectadas, token erróneo, tabla eliminada, servidor detenido. Sus comentarios
y avisos de errores son bienvenidos en
[GitHub](https://github.com/guim31/gladys-nocodb/issues).

## Lo que obtiene

- **Un dispositivo por tabla seguida**: su número de filas, o el número de
  filas de una de sus vistas (sus filtros: «tareas pendientes», «incidencias
  abiertas»…).
- Opcionalmente, **un campo de la primera fila de la vista** (su orden:
  «próxima tarea», «última lectura»), como número, sí/no o texto.
- Dos **disparadores de escena**: «Nueva fila de NocoDB» y «Filas de NocoDB por
  encima de un umbral».
- Dos **acciones de escena**: «Añadir una fila de NocoDB» y «Modificar una fila
  de NocoDB».
- Un **widget de panel**, «Tablas de NocoDB», con cada tabla seguida.

## Requisitos

- NocoDB (una versión de 2024 o posterior, API v2) accesible desde Gladys por la
  red: no `localhost`, la integración se ejecuta en su propio contenedor. NocoDB
  Cloud (`https://app.nocodb.com`) también funciona.
- Un **token de API**: en NocoDB, Ajustes de la cuenta → Tokens → Crear un
  token. El token tiene los permisos de su usuario: un usuario con el rol
  «Viewer» en una base no puede escribir en ella (las acciones de escena fallan
  entonces indicando el motivo).

## Configuración

- **Dirección**: la dirección de NocoDB vista desde Gladys, con su puerto, p.
  ej. `http://192.168.1.20:8080`. Se conserva una ruta
  (`https://example.org/nocodb`).
- **Token de API**: el token creado arriba. Nunca se escribe en los registros.
- **Intervalo de actualización**: de 30 segundos a 15 minutos (1 minuto por
  defecto). Cada tabla se lee con dos o tres solicitudes por intervalo.
- **Idioma de los mensajes**: los nombres de las nuevas funciones y los
  mensajes de las acciones de escena.

«Probar la conexión» enumera las tablas que ve el token («Base / Tabla»), lee
las tablas seguidas e indica lo que falla.

## Seguir tablas

Use «Seguir una tabla» en la configuración de la integración:

- **Tabla**: su nombre, `Base / Tabla` si varias bases tienen una tabla con ese
  nombre, o su identificador (en NocoDB: menú de la tabla → Copiar el
  identificador de la tabla).
- **Vista** (opcional): las filas contadas son las de la vista, con sus
  filtros. Sin vista, se cuentan todas las filas de la tabla.
- **Campo** (opcional): muestra también este campo de la primera fila de la
  vista. Los campos número, decimal, moneda, porcentaje, valoración, duración,
  rollup y recuento dan un número; una casilla da sí/no; cualquier otro campo,
  un texto.
- **Umbral** (opcional): un número de filas para el disparador «Filas de NocoDB
  por encima de un umbral».
- **Nombre** (opcional): el nombre del dispositivo.

Después añada el dispositivo desde la pestaña Descubrir de la integración. La
misma tabla, vista y campo de nuevo cambian el nombre o el umbral. «Dejar de
seguir una tabla» toma la misma tabla, vista y campo; su dispositivo queda en
Gladys hasta que lo elimine. Se pueden seguir 30 tablas como máximo.

## Dispositivos

- **Filas**: el número de filas de la tabla o de la vista.
- **El campo seguido**, si lo hay, con el nombre del campo.

La integración lee NocoDB con su propio temporizador (Gladys no consulta estos
dispositivos) y solo envía un valor cuando cambia.

## Escenas

### Disparadores

- **Nueva fila de NocoDB**: una fila añadida a una tabla seguida (a su vista,
  si se eligió una: una fila que no cumple sus filtros no es nueva para ella).
  Variables: la tabla, el identificador de la fila, su valor mostrado, y la
  fila completa en JSON. Las filas añadidas por las acciones de escena de esta
  integración no lo activan (sin bucle). Las filas presentes cuando se empieza a
  seguir la tabla no son nuevas. Requiere una tabla con identificador numérico,
  que tienen todas las tablas creadas en NocoDB.
- **Filas de NocoDB por encima de un umbral**: el número de filas supera el
  umbral fijado con «Seguir una tabla». Se activa una vez por cruce: el número
  debe volver al umbral o por debajo antes de activarse de nuevo. Variables: la
  tabla, el número de filas, el umbral.

El filtro de tabla de ambos disparadores es opcional: vacío, todas las tablas.

### Acciones

- **Añadir una fila de NocoDB**: añade una fila a una tabla seguida. Su
  identificador es una salida para las acciones siguientes.
- **Modificar una fila de NocoDB**: cambia campos de una fila de una tabla
  seguida, por su identificador (p. ej. la variable identificador de «Nueva
  fila de NocoDB»).

Los valores se escriben `Campo=valor; Otro=valor` (separados por `;` o saltos
de línea), o en JSON: `{"Campo": "valor", "Importe": 3}`. Las variables de
escena se pueden usar en ambos. Una casilla acepta `true`/`false`, `sí`/`no`,
`1`/`0`; un número acepta la coma. Un campo que la tabla no tiene, o que NocoDB
rellena por sí mismo (identificador, fecha de creación, fórmula…), se rechaza
con su nombre: NocoDB lo descartaría sin avisar. Un valor que NocoDB rechaza (un
texto en un campo número) falla con su mensaje.

## Panel

El widget «Tablas de NocoDB» muestra una línea por tabla seguida: su número de
filas, o el campo seguido. Las tablas mostradas se pueden elegir (solo los
dispositivos añadidos a Gladys), y su botón «Actualizar», que lee todas las
tablas al instante, se puede ocultar.

## Límites

- Solo se leen las tablas seguidas, nunca una base entera.
- Una fila nueva es una fila cuyo identificador supera el último visto: una
  tabla de una base de datos externa cuya clave es un texto no activa «Nueva
  fila de NocoDB».
- Se anuncian como máximo 10 filas nuevas por tabla y por lectura; las
  siguientes en la lectura siguiente.
- NocoDB Cloud limita la API a 5 solicitudes por segundo y usuario: las tablas
  se leen una tras otra, muy por debajo.
- Solo la API v2 de NocoDB: las versiones muy antiguas (anteriores a 2024) no
  son compatibles.

## Solución de problemas

- **«NocoDB rechaza el token de API»**: el token fue revocado, o su usuario
  perdió el acceso a la base. Cree uno nuevo.
- **«No se puede contactar con NocoDB»**: compruebe la dirección desde la
  máquina donde se ejecuta Gladys (no `localhost`), y el puerto (8080 por
  defecto).
- **«Esta dirección no responde como NocoDB»**: la dirección lleva a otro
  servidor web, o falta la ruta de un proxy inverso.
- **Una tabla muestra «Error» en el widget**: fue eliminada, o su vista lo fue;
  «Probar la conexión» la nombra. Vuelva a seguirla.
- Registros detallados: `LOG_LEVEL=debug` en el contenedor.
