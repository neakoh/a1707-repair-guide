// Renders an Echo Tutor guide as a web page. The logic at the top is pure and tested; the page part runs in a browser.

/** Whether a step applies, given the options ticked. */
export function isShown(guide, place, chosen) {
  const step = guide.steps[place];
  if (!step) return false;
  if (step.onlyIf && !chosen.has(step.onlyIf)) return false;
  if (step.unless && chosen.has(step.unless)) return false;
  return true;
}

/** Runs of consecutive steps that apply, by section name. */
export function sections(guide, chosen) {
  const runs = [];
  guide.steps.forEach((step, place) => {
    if (!isShown(guide, place, chosen)) return;
    const last = runs[runs.length - 1];
    if (last && last.name === (step.section ?? null)) last.steps.push(place);
    else runs.push({ name: step.section ?? null, steps: [place] });
  });
  return runs;
}

/** A step's number within its section, among the steps that apply. */
export function number(guide, place, chosen) {
  const run = sections(guide, chosen).find(s => s.steps.includes(place));
  return run ? run.steps.indexOf(place) + 1 : place + 1;
}

/** The parts out after the done steps that apply, up to and including `upTo`. */
export function tally(guide, done, chosen, upTo) {
  return guide.steps.flatMap((step, place) =>
    place <= upTo && done.has(place) && isShown(guide, place, chosen) ? (step.parts ?? []) : []);
}

/** Done steps as saved: by title, so they still match after steps are added or moved. */
export function savedDone(guide, done) {
  return [...done].sort((a, b) => a - b).map(place => guide.steps[place]?.title).filter(Boolean);
}

/** Done steps from what was saved: titles, or the step positions older saves hold. */
export function readDone(guide, saved) {
  return new Set((saved ?? []).map(entry => typeof entry === 'number' ? entry : guide.steps.findIndex(s => s.title === entry))
    .filter(place => place >= 0 && place < guide.steps.length));
}

export function nextShown(guide, place, chosen) {
  for (let next = place + 1; next < guide.steps.length; next++) if (isShown(guide, next, chosen)) return next;
  return null;
}

const escape = text => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function inline(text) {
  return escape(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2">$1</a>');
}

const cells = line => line.trim().replace(/^\||\|$/g, '').split('|').map(c => inline(c.trim()));

const codeBlock = code => `<div class="code"><pre><code>${escape(code)}</code></pre><button class="copy" type="button">Copy</button></div>`;

/** The Markdown subset guides use: paragraphs, bold, code and code blocks, links, lists and tables. */
export function markdown(text) {
  // Fenced blocks first, so their lines are kept as they are.
  return text.trim().split(/```[^\n]*\n([\s\S]*?)\n```/).map((part, i) =>
    i % 2 ? codeBlock(part) : part.trim() ? blocks(part) : '').join('');
}

function blocks(text) {
  return text.trim().split(/\n\s*\n/).map(block => {
    const lone = /^`([^`\n]+)`$/.exec(block.trim());
    if (lone) return codeBlock(lone[1]);
    const lines = block.split('\n');
    if (lines.every(l => /^\s*\d+\.\s/.test(l))) return `<ol>${lines.map(l => `<li>${inline(l.replace(/^\s*\d+\.\s/, ''))}</li>`).join('')}</ol>`;
    if (lines.every(l => /^\s*-\s/.test(l))) return `<ul>${lines.map(l => `<li>${inline(l.replace(/^\s*-\s/, ''))}</li>`).join('')}</ul>`;
    if (lines.length > 1 && lines.every(l => l.trim().startsWith('|'))) {
      const [head, , ...rows] = lines;
      return `<table><thead><tr>${cells(head).map(c => `<th>${c}</th>`).join('')}</tr></thead>` +
        `<tbody>${rows.map(r => `<tr>${cells(r).map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    }
    return `<p>${lines.map(inline).join('<br>')}</p>`;
  }).join('');
}

// The page: the step list down the side, one step at a time beside it, as Echo Tutor shows a guide.

const partLine = p => `${p.count ? `${p.count} × ` : ''}${escape(p.name)}${p.where ? ` <span class="where">${escape(p.where)}</span>` : ''}`;

/** A step's video, as a picture that becomes the player when clicked: a YouTube video from `start` to `end` seconds. */
function videoSlide(video, i) {
  const at = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const params = `start=${video.start ?? 0}${video.end ? `&end=${video.end}` : ''}&autoplay=1&rel=0`;
  return `<figure class="video" data-picture="${i}"${i ? ' hidden' : ''}>
    <button class="play" type="button" data-embed="https://www.youtube-nocookie.com/embed/${video.youtube}?${params}">
      <img src="https://i.ytimg.com/vi/${video.youtube}/hqdefault.jpg" alt=""><span class="play-mark"></span></button>
    <figcaption>${escape(video.caption ?? 'Video')} · ${at(video.start ?? 0)}${video.end ? `–${at(video.end)}` : ''}${video.credit ? `<span class="where"> · ${escape(video.credit)}</span>` : ''}</figcaption></figure>`;
}

function pictures(images, video) {
  if (!images?.length && !video) return '';
  const all = [...(images ?? []), ...(video ? [{ video }] : [])];
  const big = all.map((image, i) => {
    if (image.video) return videoSlide(image.video, i);
    const caption = image.caption ? escape(image.caption) : '';
    const credit = image.credit ? `<a class="credit" href="#overview">Photo: ${escape(image.credit)}</a>` : '';
    return `<figure class="${image.url.endsWith('.svg') ? 'map' : 'photo'}" data-picture="${i}"${i ? ' hidden' : ''}>
      <div class="frame"><img src="${image.url}" alt="${caption}" loading="lazy">${credit}</div>${caption ? `<figcaption>${caption}</figcaption>` : ''}</figure>`;
  }).join('');
  const thumbs = all.length > 1 ? `<div class="thumbs">${all.map((image, i) =>
    `<button data-thumb="${i}" class="${[i ? '' : 'on', image.video ? 'is-video' : ''].join(' ').trim()}"><img src="${image.video ? `https://i.ytimg.com/vi/${image.video.youtube}/mqdefault.jpg` : image.url}" alt="" loading="lazy"></button>`).join('')}</div>` : '';
  return `<div class="pictures">${big}${thumbs}</div>`;
}

function stepHTML(guide, step, place) {
  const options = (guide.options ?? []).filter(o => step.asks?.includes(o.id));
  return `<article class="step" id="step-${place}" data-place="${place}" hidden>
    <header class="step-head">
      <span class="number"></span>
      <div>${step.section ? `<p class="section-name">${escape([step.section, step.subsection].filter(Boolean).join(' · '))}</p>` : ''}
        <h1>${escape(step.title)}</h1></div>
    </header>
    ${pictures(step.images, step.video)}
    <div class="body">
    ${step.text ? `<div class="words">${markdown(step.text)}</div>` : ''}
    ${options.length ? `<fieldset class="choices">${options.map(o =>
      `<label><input type="checkbox" data-option="${o.id}"><span>${escape(o.label)}${o.detail ? `<small>${escape(o.detail)}</small>` : ''}</span></label>`).join('')}</fieldset>` : ''}
    ${step.warning ? `<p class="warning"><span class="mark">⚠</span><span>${inline(step.warning)}</span></p>` : ''}
    ${step.parts?.length ? `<div class="parts"><h4>Comes out · onto the spot marked step <span class="box"></span></h4>
      <table class="screws"><tbody>${step.parts.map(p => `<tr><td class="count">${p.count ?? ''}${p.count ? '×' : ''}</td>
        <td class="name">${escape(p.name)}</td><td class="where">${escape(p.where ?? '')}</td></tr>`).join('')}</tbody></table></div>` : ''}
    ${step.check ? `<p class="check">Done when: ${inline(step.check)}</p>` : ''}
    </div>
  </article>`;
}

function overviewHTML(guide) {
  return `<article class="step overview" id="overview" hidden>
    <h1>${escape(guide.title)}</h1>
    <div class="body">
    ${guide.summary ? `<p class="summary">${inline(guide.summary)}</p>` : ''}
    ${guide.needs?.length ? `<h4>You need</h4><ul class="needs">${guide.needs.map(n => `<li>${inline(n)}</li>`).join('')}</ul>` : ''}
    ${guide.cautions?.length ? `<ul class="cautions">${guide.cautions.map(c => `<li>${inline(c)}</li>`).join('')}</ul>` : ''}
    ${guide.publish?.credits?.length ? `<section class="sources"><h4>Sources and credits</h4>
      ${guide.publish.credits.map(c => `<p>${inline(c)}</p>`).join('')}</section>` : ''}
    </div>
  </article>`;
}

const names = guide => [...new Set(guide.steps.map(s => s.section ?? null))];

function listHTML(guide) {
  return `    ${names(guide).map(name => `<div class="section" data-section="${escape(name ?? '')}">
      <p class="section-head"><span>${escape(name ?? 'Steps')}</span><span class="count"></span></p>
      ${guide.steps.map((s, place) => (s.section ?? null) !== name ? '' :
        (s.subsection && s.subsection !== guide.steps[place - 1]?.subsection ? `<p class="subsection">${escape(s.subsection)}</p>` : '') +
        `<div class="row" data-row="${place}"><input type="checkbox" data-done="${place}" aria-label="Done">
         <a href="#step-${place}"><span class="number"></span><span class="row-title">${escape(s.title)}</span></a></div>`).join('')}
    </div>`).join('')}`;
}

function render(guide, state) {
  document.title = guide.title;
  document.body.innerHTML = `
    <aside>
      <div class="head"><button class="steps-toggle" type="button" aria-label="Show the steps">Steps</button>
        <p class="guide-title">${escape(guide.title)}</p><p class="progress"></p>
        <div class="pages"><a class="row overview-row" href="#overview">Overview, sources and credits</a></div></div>
      <nav>${listHTML(guide)}</nav>
      <footer class="bar">
        <div class="track">${names(guide).map(name =>
          `<span class="part" data-part="${escape(name ?? '')}"><span class="fill"></span></span>`).join('')}</div>
        <div class="labels">${names(guide).map(name =>
          `<p class="label" data-label="${escape(name ?? '')}">${escape(name ?? 'Steps')}</p>`).join('')}</div>
      </footer>
      <footer class="way in-list"><a class="back" href="#">← Back</a><a class="next" href="#">Done, next step →</a></footer>
    </aside>
    <main>${overviewHTML(guide)}${guide.steps.map((s, place) => stepHTML(guide, s, place)).join('')}
      <footer class="way"><a class="back" href="#">← Back</a><a class="next" href="#">Done, next step →</a></footer>
    </main>`;

  const go = target => { location.hash = target; };
  window.addEventListener('hashchange', () => show(guide, state));
  document.body.addEventListener('change', event => {
    const box = event.target;
    if (box.dataset.done !== undefined) {
      const place = Number(box.dataset.done);
      box.checked ? state.done.add(place) : state.done.delete(place);
    } else if (box.dataset.option) {
      box.checked ? state.chosen.add(box.dataset.option) : state.chosen.delete(box.dataset.option);
    } else return;
    save(guide, state);
    update(guide, state);
  });
  document.body.addEventListener('click', event => {
    const thumb = event.target.closest('[data-thumb]');
    if (thumb) showPicture(thumb.closest('.pictures'), Number(thumb.dataset.thumb));
    // A click on the picture itself moves on to the step's next picture, round to the first.
    const play = event.target.closest('.play');
    if (play) {
      play.outerHTML = `<iframe src="${play.dataset.embed}" title="Video" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;
      return;
    }
    const picture = !event.target.closest('.credit') && event.target.closest('.pictures figure:not(.video) img');
    if (picture) {
      const pictures = picture.closest('.pictures');
      const count = pictures.querySelectorAll('figure').length;
      showPicture(pictures, (Number(picture.closest('figure').dataset.picture) + 1) % count);
    }
    if (event.target.closest('.steps-toggle')) return openList(!document.body.classList.contains('list-open'));
    if (event.target.closest('nav a, .pages a')) openList(false);
    const copy = event.target.closest('.copy');
    if (copy) {
      navigator.clipboard?.writeText(copy.previousElementSibling.textContent);
      copy.textContent = 'Copied';
      copy.classList.add('done');
      setTimeout(() => { copy.textContent = 'Copy'; copy.classList.remove('done'); }, 1500);
      return;
    }
    const stage = event.target.closest('.bar [data-part], .bar [data-label]');
    if (stage) return showSection(stage.dataset.part ?? stage.dataset.label);
    const way = event.target.closest('.way a');
    if (!way) return;
    event.preventDefault();
    const at = current(guide);
    if (way.classList.contains('next')) {
      if (at === 'overview') return go(`step-${nextShown(guide, -1, state.chosen) ?? 0}`);
      state.done.add(at);
      save(guide, state);
      update(guide, state);
      const next = nextShown(guide, at, state.chosen);
      go(next === null ? 'overview' : `step-${next}`);
    } else if (at !== 'overview') {
      let back = at - 1;
      while (back >= 0 && !isShown(guide, back, state.chosen)) back--;
      go(back < 0 ? 'overview' : `step-${back}`);
    }
  });
  document.addEventListener('keydown', event => {
    if (event.target.matches('input, textarea')) return;
    if (event.key === 'ArrowRight') document.querySelector('main .way .next').click();
    if (event.key === 'ArrowLeft') document.querySelector('main .way .back').click();
  });

  if (!location.hash) {
    const first = guide.steps.findIndex((_, p) => isShown(guide, p, state.chosen) && !state.done.has(p));
    history.replaceState(null, '', state.done.size && first >= 0 ? `#step-${first}` : '#overview');
  }
  update(guide, state);
  show(guide, state);
}

/** Opens or closes the step list on phones and tablets; its button says what it will do. */
function openList(open) {
  document.body.classList.toggle('list-open', open);
  const toggle = document.querySelector('.steps-toggle');
  toggle.textContent = open ? 'Close' : 'Steps';
  toggle.setAttribute('aria-label', open ? 'Hide the steps' : 'Show the steps');
}

function showPicture(pictures, index) {
  pictures.querySelectorAll('figure').forEach(f => { f.hidden = Number(f.dataset.picture) !== index; });
  pictures.querySelectorAll('[data-thumb]').forEach(b => b.classList.toggle('on', Number(b.dataset.thumb) === index));
}

/** Shows one section's steps in the list; the others leave it, and grey out in the footer. */
function showSection(name) {
  document.querySelectorAll('nav .section').forEach(section => {
    section.hidden = section.dataset.section !== name;
  });
  document.querySelectorAll('.bar [data-part], .bar [data-label]').forEach(el =>
    el.classList.toggle('away', (el.dataset.part ?? el.dataset.label) !== name));
}

/** The step in the URL: its place, or 'overview'. */
function current(guide) {
  const hash = location.hash.slice(1);
  const match = /^step-(\d+)$/.exec(hash);
  if (match && guide.steps[Number(match[1])]) return Number(match[1]);
  return 'overview';
}

function show(guide, state) {
  const at = current(guide);
  const id = typeof at === 'number' ? `step-${at}` : at;
  document.querySelectorAll('main > article').forEach(a => { a.hidden = a.id !== id; });
  document.querySelectorAll('aside .row').forEach(row => row.classList.toggle('here',
    row.dataset.row === String(at) || (at === 'overview' && row.classList.contains('overview-row'))));
  document.querySelectorAll('.way .back').forEach(back => { back.hidden = at === 'overview'; });
  const label = at === 'overview' ? 'Start →' : nextShown(guide, at, state.chosen) === null ? 'Done' : 'Done, next step →';
  document.querySelectorAll('.way .next').forEach(next => { next.textContent = label; });
  // The list shows the section of the step at hand; the footer can show another without leaving the step.
  showSection(typeof at === 'number' ? (guide.steps[at].section ?? '') : (guide.steps[0]?.section ?? ''));
  document.querySelector('nav .here')?.scrollIntoView({ block: 'nearest' });
  document.querySelector('main').scrollTop = 0;
  window.scrollTo(0, 0);
}

function update(guide, state) {
  const runs = sections(guide, state.chosen);
  guide.steps.forEach((_, place) => {
    const shown = isShown(guide, place, state.chosen);
    const row = document.querySelector(`[data-row="${place}"]`);
    row.hidden = !shown;
    if (!shown) return;
    const n = number(guide, place, state.chosen);
    row.querySelector('.number').textContent = n;
    row.querySelector('[data-done]').checked = state.done.has(place);
    row.classList.toggle('done', state.done.has(place));
    const article = document.getElementById(`step-${place}`);
    article.querySelector('.number').textContent = n;
    article.querySelectorAll('[data-option]').forEach(box => { box.checked = state.chosen.has(box.dataset.option); });
    const box = article.querySelector('.box');
    if (box) box.textContent = n;
  });
  let total = 0, finished = 0;
  document.querySelectorAll('nav .section').forEach(section => {
    const run = runs.find(r => (r.name ?? '') === section.dataset.section);
    const done = run ? run.steps.filter(p => state.done.has(p)).length : 0;
    total += run?.steps.length ?? 0;
    finished += done;
    section.querySelector('.count').textContent = run ? (done === run.steps.length ? 'done' : `${done} of ${run.steps.length}`) : '';
    const part = document.querySelector(`.bar [data-part="${section.dataset.section}"]`);
    part.hidden = !run;
    part.querySelector('.fill').style.transform = `scaleX(${run ? done / run.steps.length : 0})`;
    document.querySelector(`.bar [data-label="${section.dataset.section}"]`).hidden = !run;
  });
  document.querySelector('.progress').textContent = `${finished} of ${total} steps done`;
}

const key = guide => `guide:${guide.publish?.project ?? guide.title}`;

function load(guide) {
  try {
    const saved = JSON.parse(localStorage.getItem(key(guide)) ?? '{}');
    return { done: readDone(guide, saved.done), chosen: new Set(saved.chosen ?? []) };
  } catch { return { done: new Set(), chosen: new Set() }; }
}

function save(guide, state) {
  localStorage.setItem(key(guide), JSON.stringify({ done: savedDone(guide, state.done), chosen: [...state.chosen] }));
}

if (typeof document !== 'undefined') {
  const build = document.documentElement.dataset.build ?? Date.now();
  const source = new URLSearchParams(location.search).get('guide') ?? `guide.json?v=${build}`;
  fetch(source, { cache: 'no-store' }).then(r => r.json()).then(guide => render(guide, load(guide)))
    .catch(error => { document.body.textContent = `The guide couldn't be loaded: ${error.message}`; });
}
