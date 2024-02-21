export namespace xml {
    export function parse(xml: string): any {
        let element = "";
        let elements: string[] = [];
        for (const c of xml) {
            if (c === "<") {
                elements.push(element);
                element = "";
                element += c;
            } else if (c === ">") {
                element += c;
                elements.push(element);
                element = "";
            } else {
                element += c;
            }
        }
        elements.push(element);
        const ignore: string[] = ["", "\n"];
        elements = elements.filter(e => !ignore.includes(e.trim()));

        const result: any = {};
        let current = result;
        const path: any[] = [];

        for (const e of elements) {
            if (e.startsWith("</")) {
                current = path.pop();
            } else if (e.startsWith("<")) {
                const newElement = getAttributes(e);
                const tagName = getTagName(e);
                if (current[tagName]) {
                    if (!Array.isArray(current[tagName])) {
                        const newArray = [];
                        newArray.push(current[tagName]);
                        current[tagName] = newArray;
                    }

                    current[tagName].push(newElement);
                } else {
                    current[getTagName(e)] = newElement;
                }
                path.push(current);
                current = newElement;

                // immediate end
                if (e.endsWith("/>")) {
                    current = path.pop();
                }
            } else {
                current.__text = e;
            }
        }

        return result;
    }

    function getAttributes(element: string): any {
        const parts = element.split("\"");
        const result: any = {};
        for (let i=0;i<parts.length;i+=2) {
            let key = parts[i].substring(parts[i].lastIndexOf(" "));
            if (key.endsWith("=")) {
                key = key.substring(0, key.length - 1).trim();
                let value = parts[i+1];
                result[key] = value;
            }
        }

        return result;
    }

    function getTagName(element: string): string {
        let result = element.split(" ")[0].substring(1).trim();

        if (result.endsWith(">")) {
            result = result.substring(0, result.length -1).trim();
        }

        return result;
    }
}