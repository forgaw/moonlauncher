const replacements: Array<[RegExp, string]> = [
  [/^Queued$/i, "В очереди"],
  [/^Installing\.{0,3}$/i, "Установка..."],
  [/^Installed$/i, "Установлено"],
  [/^Failed$/i, "Ошибка"],
  [/^Download\s+/i, "Загрузка "],
  [/^Downloading\s+/i, "Загрузка "],
  [/^Extracting\s+/i, "Распаковка "],
  [/^Preparing\s+/i, "Подготовка "],
  [/^Checking\s+/i, "Проверка "],
  [/^Finished$/i, "Завершено"],
]

export function translateInstallStatus(value: string): string {
  const source = value.trim()
  if (!source) return "Загрузка..."

  for (const [pattern, replacement] of replacements) {
    if (pattern.test(source)) {
      return source.replace(pattern, replacement)
    }
  }

  return source
}
