// -----------------------------------------------------------------------------
// Every text the container sends to Gladys, in the four languages of its
// interface. German says "du", Spanish "usted" (test/i18n.test.js).
//
// A failure of an action is thrown as an ActionFailure: Gladys shows in red
// what a handler throws and in green what it returns, so only a real success
// is returned. Its message is the multi-language object itself.
// -----------------------------------------------------------------------------

import { ERROR_KINDS } from './nocodb.js';

export class ActionFailure extends Error {
  /** @param {{ en: string, fr: string, de: string, es: string }} text */
  constructor(text) {
    super(text.en);
    this.message = text;
  }
}

export const LANGS = ['en', 'fr', 'de', 'es'];

/** The text of one language (English when missing). */
export const pick = (text, language) => text?.[language] ?? text?.en ?? '';

/** Applies `fn(language)` to every language: a multi-language object. */
export const inEveryLanguage = (fn) => Object.fromEntries(LANGS.map((lang) => [lang, fn(lang)]));

/** Joins two multi-language texts (or a text and a plain string) with a space. */
export const join = (...parts) =>
  inEveryLanguage((lang) =>
    parts
      .filter(Boolean)
      .map((part) => (typeof part === 'string' ? part : pick(part, lang)))
      .join(' '),
  );

export const INIT_FAILED = {
  en: 'The integration could not start: see its logs.',
  fr: "L'intégration n'a pas pu démarrer : voyez ses journaux.",
  de: 'Die Integration konnte nicht starten: Sieh dir ihre Protokolle an.',
  es: 'La integración no ha podido iniciarse: consulte sus registros.',
};

// Why there is no connection, before any request.
export const CONNECTION_TEXT = {
  noUrl: {
    en: 'Enter the address of your NocoDB in the configuration.',
    fr: "Saisissez l'adresse de votre NocoDB dans la configuration.",
    de: 'Gib die Adresse deines NocoDB in der Konfiguration ein.',
    es: 'Introduzca la dirección de su NocoDB en la configuración.',
  },
  badUrl: {
    en: 'The NocoDB address is not valid: e.g. http://192.168.1.20:8080, without user or password.',
    fr: "L'adresse de NocoDB n'est pas valide : ex. http://192.168.1.20:8080, sans utilisateur ni mot de passe.",
    de: 'Die NocoDB-Adresse ist ungültig: z. B. http://192.168.1.20:8080, ohne Benutzer oder Passwort.',
    es: 'La dirección de NocoDB no es válida: p. ej. http://192.168.1.20:8080, sin usuario ni contraseña.',
  },
  noToken: {
    en: 'Enter a NocoDB API token in the configuration (Account settings → Tokens).',
    fr: "Saisissez un jeton d'API NocoDB dans la configuration (Paramètres du compte → Tokens).",
    de: 'Gib in der Konfiguration ein NocoDB-API-Token ein (Kontoeinstellungen → Tokens).',
    es: 'Introduzca un token de API de NocoDB en la configuración (Ajustes de la cuenta → Tokens).',
  },
};

// One per error kind of the client (src/nocodb.js).
export const ERROR_TEXT = {
  [ERROR_KINDS.AUTH]: {
    en: 'NocoDB refuses the API token (wrong, revoked or without access).',
    fr: "NocoDB refuse le jeton d'API (faux, révoqué ou sans accès).",
    de: 'NocoDB lehnt das API-Token ab (falsch, widerrufen oder ohne Zugriff).',
    es: 'NocoDB rechaza el token de API (erróneo, revocado o sin acceso).',
  },
  [ERROR_KINDS.NOT_FOUND]: {
    en: 'NocoDB does not know this table, view or row (deleted?).',
    fr: 'NocoDB ne connaît pas cette table, vue ou ligne (supprimée ?).',
    de: 'NocoDB kennt diese Tabelle, Ansicht oder Zeile nicht (gelöscht?).',
    es: 'NocoDB no conoce esta tabla, vista o fila (¿eliminada?).',
  },
  [ERROR_KINDS.INVALID]: {
    en: 'NocoDB refused the request.',
    fr: 'NocoDB a refusé la requête.',
    de: 'NocoDB hat die Anfrage abgelehnt.',
    es: 'NocoDB ha rechazado la solicitud.',
  },
  [ERROR_KINDS.RATE_LIMITED]: {
    en: 'NocoDB asks to slow down (too many requests).',
    fr: 'NocoDB demande de ralentir (trop de requêtes).',
    de: 'NocoDB bittet, langsamer zu werden (zu viele Anfragen).',
    es: 'NocoDB pide reducir el ritmo (demasiadas solicitudes).',
  },
  [ERROR_KINDS.UNREACHABLE]: {
    en: 'NocoDB cannot be reached: check the address and that it is running.',
    fr: "NocoDB est injoignable : vérifiez l'adresse et qu'il tourne.",
    de: 'NocoDB ist nicht erreichbar: Prüfe die Adresse und ob es läuft.',
    es: 'No se puede contactar con NocoDB: compruebe la dirección y que esté en marcha.',
  },
  [ERROR_KINDS.TIMEOUT]: {
    en: 'NocoDB did not answer within 10 seconds.',
    fr: "NocoDB n'a pas répondu en 10 secondes.",
    de: 'NocoDB hat nicht innerhalb von 10 Sekunden geantwortet.',
    es: 'NocoDB no ha respondido en 10 segundos.',
  },
  [ERROR_KINDS.NOT_NOCODB]: {
    en: 'This address does not answer like NocoDB: check it (port, path).',
    fr: 'Cette adresse ne répond pas comme NocoDB : vérifiez-la (port, chemin).',
    de: 'Diese Adresse antwortet nicht wie NocoDB: Prüfe sie (Port, Pfad).',
    es: 'Esta dirección no responde como NocoDB: compruébela (puerto, ruta).',
  },
  [ERROR_KINDS.OTHER]: {
    en: 'NocoDB answered with an error: see the logs of the integration.',
    fr: "NocoDB a répondu par une erreur : voyez les journaux de l'intégration.",
    de: 'NocoDB hat mit einem Fehler geantwortet: Sieh dir die Protokolle der Integration an.',
    es: 'NocoDB ha respondido con un error: consulte los registros de la integración.',
  },
};

// Configuration actions and scene actions.
export const ACTION_TEXT = {
  noTable: {
    en: 'Enter the table to follow: its name, "Base / Table", or its id.',
    fr: 'Saisissez la table à suivre : son nom, « Base / Table », ou son identifiant.',
    de: 'Gib die zu verfolgende Tabelle ein: ihren Namen, „Base / Tabelle“ oder ihre ID.',
    es: 'Introduzca la tabla que quiere seguir: su nombre, «Base / Tabla», o su identificador.',
  },
  tableNotFound: {
    en: 'No table of this name: "Test the connection" lists them.',
    fr: 'Aucune table de ce nom : « Tester la connexion » les liste.',
    de: 'Keine Tabelle mit diesem Namen: „Verbindung testen“ listet sie auf.',
    es: 'Ninguna tabla con este nombre: «Probar la conexión» las enumera.',
  },
  tableAmbiguous: {
    en: 'Several tables have this name: write "Base / Table", or the id of the table.',
    fr: "Plusieurs tables portent ce nom : écrivez « Base / Table », ou l'identifiant de la table.",
    de: 'Mehrere Tabellen tragen diesen Namen: Schreib „Base / Tabelle“ oder die ID der Tabelle.',
    es: 'Varias tablas tienen este nombre: escriba «Base / Tabla», o el identificador de la tabla.',
  },
  viewNotFound: {
    en: 'This table has no view of this name.',
    fr: "Cette table n'a pas de vue de ce nom.",
    de: 'Diese Tabelle hat keine Ansicht mit diesem Namen.',
    es: 'Esta tabla no tiene ninguna vista con este nombre.',
  },
  fieldNotFound: {
    en: 'This table has no field of this name.',
    fr: "Cette table n'a pas de champ de ce nom.",
    de: 'Diese Tabelle hat kein Feld mit diesem Namen.',
    es: 'Esta tabla no tiene ningún campo con este nombre.',
  },
  badThreshold: {
    en: 'The threshold must be a whole number of rows, 0 or more.',
    fr: 'Le seuil doit être un nombre entier de lignes, 0 ou plus.',
    de: 'Der Schwellenwert muss eine ganze Zeilenzahl sein, 0 oder mehr.',
    es: 'El umbral debe ser un número entero de filas, 0 o más.',
  },
  tooMany: {
    en: 'At most 30 tables can be followed: remove one first.',
    fr: "30 tables au plus peuvent être suivies : retirez-en une d'abord.",
    de: 'Höchstens 30 Tabellen können verfolgt werden: Entferne zuerst eine.',
    es: 'Se pueden seguir 30 tablas como máximo: elimine una primero.',
  },
  notFollowed: {
    en: 'This table (with this view and field) is not followed.',
    fr: "Cette table (avec cette vue et ce champ) n'est pas suivie.",
    de: 'Diese Tabelle (mit dieser Ansicht und diesem Feld) wird nicht verfolgt.',
    es: 'Esta tabla (con esta vista y este campo) no se sigue.',
  },
  unknownDevice: {
    en: 'Choose a NocoDB table device: this one is not followed any more.',
    fr: "Choisissez un appareil table NocoDB : celui-ci n'est plus suivi.",
    de: 'Wähle ein NocoDB-Tabellengerät: Dieses wird nicht mehr verfolgt.',
    es: 'Elija un dispositivo de tabla de NocoDB: este ya no se sigue.',
  },
  noValues: {
    en: 'Enter the values: {"Field": "value"} in JSON, or Field=value; Other=value.',
    fr: 'Saisissez les valeurs : {"Champ": "valeur"} en JSON, ou Champ=valeur; Autre=valeur.',
    de: 'Gib die Werte ein: {"Feld": "Wert"} als JSON oder Feld=Wert; Anderes=Wert.',
    es: 'Introduzca los valores: {"Campo": "valor"} en JSON, o Campo=valor; Otro=valor.',
  },
  badValues: {
    en: 'The values cannot be read: write {"Field": "value"} in JSON, or Field=value; Other=value.',
    fr: 'Les valeurs sont illisibles : écrivez {"Champ": "valeur"} en JSON, ou Champ=valeur; Autre=valeur.',
    de: 'Die Werte sind nicht lesbar: Schreib {"Feld": "Wert"} als JSON oder Feld=Wert; Anderes=Wert.',
    es: 'Los valores no se pueden leer: escriba {"Campo": "valor"} en JSON, o Campo=valor; Otro=valor.',
  },
  unknownFields: {
    en: 'Unknown fields in this table:',
    fr: 'Champs inconnus dans cette table :',
    de: 'Unbekannte Felder in dieser Tabelle:',
    es: 'Campos desconocidos en esta tabla:',
  },
  readOnlyFields: {
    en: 'NocoDB fills these fields itself:',
    fr: 'NocoDB remplit lui-même ces champs :',
    de: 'NocoDB füllt diese Felder selbst aus:',
    es: 'NocoDB rellena estos campos por sí mismo:',
  },
  noRowId: {
    en: 'Enter the id of the row to update (e.g. a variable of "New NocoDB row").',
    fr: "Saisissez l'identifiant de la ligne à modifier (ex. une variable de « Nouvelle ligne NocoDB »).",
    de: 'Gib die ID der zu ändernden Zeile ein (z. B. eine Variable von „Neue NocoDB-Zeile“).',
    es: 'Introduzca el identificador de la fila que quiere modificar (p. ej. una variable de «Nueva fila de NocoDB»).',
  },
  rowNotFound: {
    en: 'This table has no row with this id.',
    fr: "Cette table n'a pas de ligne avec cet identifiant.",
    de: 'Diese Tabelle hat keine Zeile mit dieser ID.',
    es: 'Esta tabla no tiene ninguna fila con este identificador.',
  },
  noPrimaryKey: {
    en: 'This table has no primary key: its rows cannot be updated.',
    fr: "Cette table n'a pas de clé primaire : ses lignes ne peuvent pas être modifiées.",
    de: 'Diese Tabelle hat keinen Primärschlüssel: Zeilen darin lassen sich nicht ändern.',
    es: 'Esta tabla no tiene clave primaria: sus filas no se pueden modificar.',
  },
  refused: {
    en: 'NocoDB refused the values:',
    fr: 'NocoDB a refusé les valeurs :',
    de: 'NocoDB hat die Werte abgelehnt:',
    es: 'NocoDB ha rechazado los valores:',
  },
};

// Names of the devices and features (frozen at creation in Gladys).
export const FEATURE_TEXT = {
  en: { rows: 'Rows', value: (field) => field },
  fr: { rows: 'Lignes', value: (field) => field },
  de: { rows: 'Zeilen', value: (field) => field },
  es: { rows: 'Filas', value: (field) => field },
};

// Lines of the "Test the connection" report, and the answers of the
// configuration actions.
export const REPORT_TEXT = {
  en: {
    connected: (version, bases, tables) =>
      `Connected to NocoDB${version ? ` ${version}` : ''}: ${bases} base(s), ${tables} table(s).`,
    tables: 'Tables:',
    followed: (count) => `${count} table(s) followed.`,
    problem: (name) => `Problem with "${name}":`,
    followedNow: (name) => `"${name}" followed: add its device from the Discover tab.`,
    updated: (name) => `"${name}" updated.`,
    unfollowed: (name) => `"${name}" is no longer followed. Delete its device in Gladys if needed.`,
  },
  fr: {
    connected: (version, bases, tables) =>
      `Connecté à NocoDB${version ? ` ${version}` : ''} : ${bases} base(s), ${tables} table(s).`,
    tables: 'Tables :',
    followed: (count) => `${count} table(s) suivie(s).`,
    problem: (name) => `Problème avec « ${name} » :`,
    followedNow: (name) =>
      `« ${name} » est suivie : ajoutez son appareil depuis l'onglet Découverte.`,
    updated: (name) => `« ${name} » mise à jour.`,
    unfollowed: (name) =>
      `« ${name} » n'est plus suivie. Supprimez son appareil dans Gladys si besoin.`,
  },
  de: {
    connected: (version, bases, tables) =>
      `Mit NocoDB${version ? ` ${version}` : ''} verbunden: ${bases} Base(s), ${tables} Tabelle(n).`,
    tables: 'Tabellen:',
    followed: (count) => `${count} Tabelle(n) verfolgt.`,
    problem: (name) => `Problem mit „${name}“:`,
    followedNow: (name) => `„${name}“ wird verfolgt: Füge ihr Gerät im Tab „Entdecken“ hinzu.`,
    updated: (name) => `„${name}“ aktualisiert.`,
    unfollowed: (name) =>
      `„${name}“ wird nicht mehr verfolgt. Lösche ihr Gerät in Gladys, falls nötig.`,
  },
  es: {
    connected: (version, bases, tables) =>
      `Conectado a NocoDB${version ? ` ${version}` : ''}: ${bases} base(s), ${tables} tabla(s).`,
    tables: 'Tablas:',
    followed: (count) => `${count} tabla(s) seguida(s).`,
    problem: (name) => `Problema con «${name}»:`,
    followedNow: (name) => `«${name}» se sigue: añada su dispositivo desde la pestaña Descubrir.`,
    updated: (name) => `«${name}» actualizada.`,
    unfollowed: (name) =>
      `«${name}» ya no se sigue. Elimine su dispositivo en Gladys si es necesario.`,
  },
};

/** A report line in every language: `REPORT_TEXT[lang][key](...args)`. */
export const report = (key, ...args) =>
  inEveryLanguage((lang) => {
    const entry = REPORT_TEXT[lang][key];
    return typeof entry === 'function' ? entry(...args) : entry;
  });

/** The text of a NocoDbError kind. */
export const errorText = (kind) => ERROR_TEXT[kind] ?? ERROR_TEXT[ERROR_KINDS.OTHER];
