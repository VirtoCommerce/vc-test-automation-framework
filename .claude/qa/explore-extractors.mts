export const PAGE_EXTRACTOR =
  "() => [...document.querySelectorAll('*')].map((element) => ({ tag: element.tagName.toLowerCase(), attributes: [...element.attributes].filter((attribute) => attribute.name.startsWith('data-') || ['id', 'role', 'name', 'class'].includes(attribute.name)).map((attribute) => [attribute.name, attribute.value]), text: (element.textContent || '').trim().slice(0, 60) })).filter((item) => item.attributes.length > 0).slice(0, 400)";

export const EXTRACTORS: readonly string[] = [PAGE_EXTRACTOR];
