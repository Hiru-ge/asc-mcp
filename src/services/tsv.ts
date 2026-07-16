/** 売上レポート(TSV)のパースヘルパー。 */

export interface ParsedTsv {
  rows: Record<string, string>[];
  totalRows: number;
}

const TSV_PREVIEW_ROW_LIMIT = 50;

/**
 * RFC 4180準拠のCSV1行パーサー。ダブルクォートで囲まれたフィールド内のカンマ・改行・
 * ""エスケープに対応する。区切り文字がカンマと判定された場合のみ使用する。
 */
function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
}

/** 区切り文字に応じて1行をセル配列に分割する。カンマ区切りの場合のみクォート対応パーサーを使う。 */
function splitLine(line: string, delimiter: string): string[] {
  return delimiter === "," ? splitCsvLine(line) : line.split(delimiter);
}

/** ヘッダ行をキーにしたオブジェクト配列にTSVをパースする。行数が多い場合は先頭50行のみ返す。 */
export function parseTsvPreview(tsv: string): ParsedTsv {
  const lines = tsv.split("\n").filter((line) => line.length > 0);
  if (lines.length === 0) {
    return { rows: [], totalRows: 0 };
  }

  const headers = lines[0].split("\t");
  const dataLines = lines.slice(1);

  const rows = dataLines.slice(0, TSV_PREVIEW_ROW_LIMIT).map((line) => {
    const cells = line.split("\t");
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = cells[index] ?? "";
    });
    return row;
  });

  return { rows, totalRows: dataLines.length };
}

/**
 * Analytics Reportsの複数セグメント(それぞれ独立したヘッダ付きCSV/TSV)を1つの表に結合してパースする。
 * 区切り文字は先頭セグメントの1行目にタブが含まれるかで判定する(含まれればTSV、なければCSV)。
 * 行数が多い場合は先頭50行のみ返す。
 */
export function parseAnalyticsSegments(segmentTexts: string[]): ParsedTsv {
  let headers: string[] = [];
  let delimiter = "\t";
  const dataLines: string[] = [];

  segmentTexts.forEach((text, index) => {
    const lines = text.split("\n").filter((line) => line.length > 0);
    if (lines.length === 0) {
      return;
    }
    if (index === 0) {
      delimiter = lines[0].includes("\t") ? "\t" : ",";
      headers = splitLine(lines[0], delimiter);
      dataLines.push(...lines.slice(1));
    } else {
      // 2セグメント目以降もヘッダ行を含むため、先頭行はスキップしてデータ行のみ結合する
      dataLines.push(...lines.slice(1));
    }
  });

  const rows = dataLines.slice(0, TSV_PREVIEW_ROW_LIMIT).map((line) => {
    const cells = splitLine(line, delimiter);
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = cells[index] ?? "";
    });
    return row;
  });

  return { rows, totalRows: dataLines.length };
}
