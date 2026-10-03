// Gera, para cada loja ativa, uma página HTML pronta para o Google e as IAs
// (título, descrição, Open Graph, Schema.org Restaurant e o cardápio em texto),
// além do sitemap.xml e do robots.txt.
//
// O cliente continua vendo o cardápio normal (React): a página gerada carrega o
// mesmo app, que substitui o conteúdo estático assim que abre.
//
// Uso: node tools/gerar-seo.mjs <pasta-publicada>
//   - a pasta precisa ter o index.html do build (é usado como molde)
//   - variáveis de ambiente: SUPABASE_URL e SUPABASE_KEY (chave pública/anon)
// Saída: <pasta>/seo/<slug>.html, <pasta>/sitemap.xml, <pasta>/robots.txt
import { mkdir, readFile, rename, writeFile, readdir, unlink } from 'node:fs/promises'
import { join } from 'node:path'

const SITE = 'https://app.getzapdelivery.com.br'
const pasta = process.argv[2]
const url = (process.env.SUPABASE_URL || '').trim().replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '')
const key = (process.env.SUPABASE_KEY || '').trim()
if (!pasta || !url || !key) { console.error('Uso: SUPABASE_URL=... SUPABASE_KEY=... node tools/gerar-seo.mjs <pasta>'); process.exit(1) }

// Categorias de bebidas não entram nas palavras-chave nem no cardápio da página de SEO
const BEBIDAS = /bebida|cerveja|chopp?|refri|refrigerante|suco|drink|coquetel|caipirinha|vinho|espumante|[áa]gua|destilad|whisk|vodka|gin\b|cacha[çc]a|licor|energ[ée]tic|dose|long ?neck|lata/i
const DIAS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

async function api(tabela, query) {
  const r = await fetch(`${url}/rest/v1/${tabela}?${query}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } })
  if (!r.ok) throw new Error(`${tabela}: ${r.status} ${await r.text()}`)
  return r.json()
}

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const json = o => JSON.stringify(o).replace(/</g, '\\u003c')
const brl = n => Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const corta = (s, n) => (s.length <= n ? s : s.slice(0, n - 1).replace(/[\s,;.]+\S*$/, '') + '…')
const hm = t => (t ?? '').slice(0, 5)

function pagina(molde, loja, cats, prods, horarios) {
  const canonical = `${SITE}/${loja.slug}`
  const local = [loja.cidade, loja.uf].filter(Boolean).join(' - ')
  const catsComida = cats.filter(c => !BEBIDAS.test(c.nome))
  const idsComida = new Set(catsComida.map(c => c.id))
  const comida = prods.filter(p => idsComida.has(p.categoria_id))
  // Palavras-chave: nomes dos pratos (sem repetição, sem bebidas), mais o tipo de cozinha e a cidade
  const nomes = [...new Set(comida.map(p => p.nome.trim()))]
  const palavras = [...new Set([loja.tipo_cozinha, ...catsComida.map(c => c.nome), ...nomes, local && `delivery ${loja.cidade}`].filter(Boolean))]

  // Título: usa a versão mais completa que couber em ~65 caracteres (limite que o Google costuma mostrar)
  const tipo = loja.tipo_cozinha ? ` – ${loja.tipo_cozinha}` : ''
  const onde = loja.cidade ? ` em ${loja.cidade}` : ''
  const titulo = [`${loja.nome}${tipo}${onde} | Cardápio e Delivery`, `${loja.nome}${tipo}${onde} | Delivery`, `${loja.nome}${onde} | Cardápio e Delivery`, `${loja.nome}${onde} | Delivery`]
    .find(t => t.length <= 65) ?? corta(`${loja.nome}${onde} | Delivery`, 65)
  const destaque = nomes.slice(0, 4).join(', ')
  const descricao = corta([
    loja.descricao_seo?.trim(),
    destaque && `Peça ${destaque}${nomes.length > 4 ? ' e muito mais' : ''}`,
    loja.cidade ? `com entrega e retirada em ${local}.` : 'com entrega e retirada.',
    'Cardápio online e pedido pelo WhatsApp.',
  ].filter(Boolean).join(' ').replace(/\.\s*Peça/, '. Peça'), 160)
  const imagem = loja.banner_pc_url || loja.banner_celular_url || loja.logo_url
  const img = imagem && (imagem.startsWith('http') ? imagem : SITE + imagem)

  const precos = comida.map(p => Number(p.preco)).filter(n => n > 0)
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'Restaurant',
    '@id': canonical,
    name: loja.nome,
    url: canonical,
    ...(img && { image: img }),
    ...(loja.logo_url && { logo: loja.logo_url }),
    ...(loja.descricao_seo && { description: loja.descricao_seo }),
    ...(loja.whatsapp && { telephone: '+' + loja.whatsapp }),
    ...(loja.tipo_cozinha && { servesCuisine: loja.tipo_cozinha }),
    ...(precos.length && { priceRange: `${brl(Math.min(...precos))} - ${brl(Math.max(...precos))}` }),
    currenciesAccepted: 'BRL',
    ...((loja.endereco || loja.cidade) && {
      address: {
        '@type': 'PostalAddress',
        ...(loja.endereco && { streetAddress: loja.endereco }),
        ...(loja.cidade && { addressLocality: loja.cidade }),
        ...(loja.uf && { addressRegion: loja.uf }),
        ...(loja.cep && { postalCode: loja.cep }),
        addressCountry: 'BR',
      },
    }),
    ...(horarios.length && {
      openingHoursSpecification: horarios.filter(h => !h.fechado && h.abre && h.fecha)
        .map(h => ({ '@type': 'OpeningHoursSpecification', dayOfWeek: `https://schema.org/${DIAS[h.dia_semana]}`, opens: hm(h.abre), closes: hm(h.fecha) })),
    }),
    potentialAction: { '@type': 'OrderAction', target: { '@type': 'EntryPoint', urlTemplate: canonical, inLanguage: 'pt-BR', actionPlatform: ['https://schema.org/DesktopWebPlatform', 'https://schema.org/MobileWebPlatform'] }, deliveryMethod: ['http://purl.org/goodrelations/v1#DeliveryModeOwnFleet', 'http://purl.org/goodrelations/v1#DeliveryModePickUp'] },
    hasMenu: {
      '@type': 'Menu',
      name: `Cardápio ${loja.nome}`,
      url: canonical,
      inLanguage: 'pt-BR',
      hasMenuSection: catsComida.map(c => ({
        '@type': 'MenuSection',
        name: c.nome,
        hasMenuItem: comida.filter(p => p.categoria_id === c.id).map(p => ({
          '@type': 'MenuItem',
          name: p.nome,
          ...(p.descricao && { description: p.descricao }),
          ...(p.foto_url && { image: p.foto_url }),
          offers: { '@type': 'Offer', price: Number(p.preco).toFixed(2), priceCurrency: 'BRL' },
        })),
      })).filter(s => s.hasMenuItem.length),
    },
  }

  const head = `<title>${esc(titulo)}</title>
<meta name="description" content="${esc(descricao)}">
<meta name="keywords" content="${esc(palavras.slice(0, 40).join(', '))}">
<link rel="canonical" href="${canonical}">
<meta name="robots" content="index,follow,max-image-preview:large">
<meta property="og:type" content="restaurant.restaurant">
<meta property="og:locale" content="pt_BR">
<meta property="og:site_name" content="GetZap Delivery">
<meta property="og:title" content="${esc(titulo)}">
<meta property="og:description" content="${esc(descricao)}">
<meta property="og:url" content="${canonical}">
${img ? `<meta property="og:image" content="${esc(img)}">\n<meta name="twitter:card" content="summary_large_image">` : '<meta name="twitter:card" content="summary">'}
${loja.cidade ? `<meta name="geo.placename" content="${esc(loja.cidade)}">` : ''}${loja.uf ? `\n<meta name="geo.region" content="BR-${esc(loja.uf)}">` : ''}
<script type="application/ld+json">${json(ld)}</script>`

  // Conteúdo em texto (lido por robôs que não executam JavaScript); some quando o app abre
  const horasTxt = horarios.length ? horarios.slice().sort((a, b) => a.dia_semana - b.dia_semana)
    .map(h => `<li>${['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'][h.dia_semana]}: ${h.fechado || !h.abre ? 'fechado' : `${hm(h.abre)} às ${hm(h.fecha)}`}</li>`).join('') : ''
  const corpo = `<div id="root"><main style="font-family:Arial,sans-serif;max-width:672px;margin:0 auto;padding:16px">
<h1>${esc(loja.nome)}${loja.cidade ? ` – ${esc(loja.tipo_cozinha ? loja.tipo_cozinha + ' em ' : 'delivery em ')}${esc(local)}` : ''}</h1>
${loja.descricao_seo ? `<p>${esc(loja.descricao_seo)}</p>` : ''}
${loja.endereco || loja.cidade ? `<p>Endereço: ${esc([loja.endereco, local, loja.cep].filter(Boolean).join(', '))}</p>` : ''}
${horasTxt ? `<h2>Horário de funcionamento</h2><ul>${horasTxt}</ul>` : ''}
<h2>Cardápio</h2>
${catsComida.map(c => { const itens = comida.filter(p => p.categoria_id === c.id); return itens.length ? `<h3>${esc(c.nome)}</h3><ul>${itens.map(p => `<li><strong>${esc(p.nome)}</strong> – ${brl(p.preco)}${p.descricao ? `<br>${esc(p.descricao)}` : ''}</li>`).join('')}</ul>` : '' }).join('\n')}
<p><a href="${canonical}">Fazer pedido online</a></p>
</main></div>`

  return molde
    .replace(/<title>[\s\S]*?<\/title>/, head)
    .replace('<div id="root"></div>', corpo)
}

async function main() {
  const molde = await readFile(join(pasta, 'index.html'), 'utf8')
  const lojas = await api('lojas', 'select=id,slug,nome,whatsapp,endereco,cidade,uf,cep,tipo_cozinha,descricao_seo,logo_url,banner_pc_url,banner_celular_url,plataforma_ativa&plataforma_ativa=eq.true')
  const [cats, prods, horarios] = await Promise.all([
    api('categorias', 'select=id,loja_id,nome,ordem&order=ordem'),
    api('produtos', 'select=id,loja_id,categoria_id,nome,descricao,preco,foto_url&ativo=eq.true&order=nome'),
    api('horarios_funcionamento', 'select=loja_id,dia_semana,abre,fecha,fechado'),
  ])
  const seo = join(pasta, 'seo')
  await mkdir(seo, { recursive: true })
  const gerados = new Set()
  for (const loja of lojas) {
    if (!/^[a-z0-9-]+$/.test(loja.slug)) continue
    const html = pagina(molde, loja, cats.filter(c => c.loja_id === loja.id), prods.filter(p => p.loja_id === loja.id), horarios.filter(h => h.loja_id === loja.id))
    const destino = join(seo, `${loja.slug}.html`)
    await writeFile(destino + '.tmp', html)
    await rename(destino + '.tmp', destino)
    gerados.add(`${loja.slug}.html`)
  }
  // Remove páginas de lojas que saíram do ar
  for (const f of await readdir(seo)) if (f.endsWith('.html') && !gerados.has(f)) await unlink(join(seo, f))

  const hoje = new Date().toISOString().slice(0, 10)
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${lojas.filter(l => /^[a-z0-9-]+$/.test(l.slug)).map(l => `  <url><loc>${SITE}/${l.slug}</loc><lastmod>${hoje}</lastmod><changefreq>daily</changefreq></url>`).join('\n')}
</urlset>
`
  await writeFile(join(pasta, 'sitemap.xml'), sitemap)
  await writeFile(join(pasta, 'robots.txt'), `User-agent: *
Allow: /
Disallow: /painel
Disallow: /admin
Disallow: /monitor
Disallow: /seo/

Sitemap: ${SITE}/sitemap.xml
`)
  console.log(`SEO: ${gerados.size} página(s) gerada(s).`)
}

main().catch(e => { console.error(e); process.exit(1) })
