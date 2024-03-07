export namespace translate {
    export type TranslatedText = Record<string, string>;
    export type Translations = Record<string, TranslatedText>;

    let config: Translations;
    const localLanguage = navigator.language.substring(0, 2);

    export function init(translations: Translations) {
        config = translations;
    }

    export function translate(text: string): string {
        if (config) {
            if (config[text]) {
                return config[text][localLanguage] ?? text;
            }
        }

        return text;
    }
}