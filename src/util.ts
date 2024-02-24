export namespace util {
    export function copyObject(obj: any): any {
        if (obj === null || obj === undefined) {
            return obj;
        }
        if (Array.isArray(obj)) {
            const result = [];
            for (const element of obj) {
                result.push(copyObject(element));
            }
            return result;
        }

        const result = {...obj};

        for (const key in result) {
            const value = result[key];

            if (value === null || value === undefined) {
                // leave it alone
            } else if (Array.isArray(value)) {
                result[key] = [];
                for (const element of value) {
                    result[key].push(copyObject(element));
                } 
            } else if (typeof value === "object") {
                result[key] = copyObject(value);
            }
        }

        return result;
    }
}