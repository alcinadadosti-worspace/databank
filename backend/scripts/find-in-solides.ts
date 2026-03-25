import 'dotenv/config';

const TOKEN = process.env.SOLIDES_API_TOKEN!;

const targets = [
  'thamires emanuelle',
  'fabia batista',
  'luiz felipe guedes',
  'carol marter',
  'jaine mariana',
];

function normalize(name: string) {
  return name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
}

async function main() {
  let page = 0;
  let totalPages = 1;
  const all: { id: string; name: string }[] = [];

  while (page < totalPages) {
    const url = new URL('https://employer.tangerino.com.br/employee/find-all');
    url.searchParams.set('page', String(page));
    url.searchParams.set('size', '500');
    url.searchParams.set('showFired', 'false');

    const res = await fetch(url.toString(), {
      headers: { Authorization: TOKEN, Accept: 'application/json' },
    });
    const data = await res.json();
    totalPages = data.totalPages || 1;
    for (const emp of data.content || []) {
      all.push({ id: String(emp.id), name: emp.name });
    }
    page++;
  }

  console.log(`Total no Solides: ${all.length} colaboradores\n`);

  for (const target of targets) {
    const key = normalize(target);
    const tokens = key.split(' ').filter(t => t.length > 3);

    const scored = all.map(emp => {
      const en = normalize(emp.name);
      const score = tokens.filter(t => en.includes(t)).length;
      return { ...emp, score };
    }).filter(e => e.score >= 1)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    console.log(`"${target}":`);
    if (scored.length === 0) {
      console.log('  -> nenhum resultado');
    } else {
      for (const e of scored) {
        console.log(`  [${e.score}/${tokens.length}] ID ${e.id}: ${e.name}`);
      }
    }
    console.log();
  }

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
