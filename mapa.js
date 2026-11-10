const colors = ['#087f77','#1c60af','#b2431d','#772fb3','#a51e60','#526a13'];
const shortNames = ['AirGradient','Clarity','SMOGGIE-PM','IQAir','Airnote','SimpleSpace'];
const map = document.getElementById('map');
const tip = document.getElementById('tip');
const detail = document.getElementById('detail');
const query = document.getElementById('query');
const results = document.getElementById('results');
const legend = document.getElementById('legend');
const placePicker = document.getElementById('place-picker');
const countries = topojson.feature(topology,topology.objects.features).features;
const colombia = countries.find(country => country.properties.id === 'COL');
const allCountries = {type:'FeatureCollection',features:countries};
const sphere = {type:'Sphere'};
const equator = {type:'MultiLineString',coordinates:[[-179,-90,0],[0,90,179]].map(segment => segment.map(lon => [lon,0]))};
const views = {
  world:[0,0,1], colombia:[-74.8,4.8,11], bogota:[-74.08529,4.598369,120],
  aburra:[-75.57,6.22,245], equator:[0,0,1.1]
};
const state = {mode:'flat',lon:0,lat:0,zoom:1,active:new Set(registry.map((_,i) => i)),selected:records.find(p=>p.id==='1-0')};
if (placePicker) {
  state.selected = records.find(point=>point.id==='0-0');
  [state.lon,state.lat,state.zoom] = views.colombia;
}
const svgNS = 'http://www.w3.org/2000/svg';
let projection, size, frame, drag, moved = false;

function svgNode(tag, attributes, content) {
  const node = document.createElementNS(svgNS,tag);
  for (const [key,value] of Object.entries(attributes)) node.setAttribute(key,value);
  if (content) node.textContent = content;
  return node;
}
function html(tag, content, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content) node.textContent = content;
  return node;
}
function swatch(index) {
  const dot = html('span',null,'swatch');
  dot.style.setProperty('--color',colors[index]);
  dot.setAttribute('aria-hidden','true');
  return dot;
}
function sourceList(pairs) {
  const list = html('ul');
  for (const [name,url] of pairs) {
    const item = html('li');
    const link = html('a',name);
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    item.append(link);
    list.append(item);
  }
  return list;
}
function drawComparison(record) {
  const box = html('section',null,'comparison');
  const data = record.comparison;
  const title = record.comparisonScope === 'red' ? 'Calibración de la red' :
    data && record.comparisonScope === 'externa' ? 'Evaluación en otro sitioos' : 'Comparación con referencia';
  box.append(html('h3',title));
  if (!data) {
    box.append(html('p','La ficha del sitio corresponde a un registro de monitoreo. Las referencias técnicas están en el índice por equipo.'));
    return box;
  }
  box.append(html('strong',data.site),html('p',data.context,'muted'));
  const table = html('table');
  table.setAttribute('aria-label','Métricas de desempeño');
  const heading = table.createTHead().insertRow();
  for (const label of data.headers) {
    const cell = html('th',label);
    cell.scope = 'col';
    heading.append(cell);
  }
  const body = table.createTBody();
  for (const [label,...values] of data.rows) {
    const row = body.insertRow();
    const cell = html('th',label);
    cell.scope = 'row';
    row.append(cell);
    for (const value of values) row.append(html('td',value));
  }
  box.append(table,html('p',data.assessment),sourceList([data.link]));
  return box;
}
function drawDetail(record) {
  const group = registry[record.groupId];
  const header = html('div',null,'detail-head');
  header.style.setProperty('--sensor',colors[record.groupId]);
  header.append(html('small',record.model ?? group.name,'muted'),html('h2',record.place));
  const status = record.status === 'exact' ? 'Modelo exacto' : 'Marca o variante relacionada';
  header.append(html('small',status+' · '+record.period,'muted'));
  if (placePicker) {
    detail.replaceChildren(header,drawComparison(record));
    const firstSource = record.links[0];
    if (firstSource && firstSource[1] !== record.comparison?.link[1]) {
      detail.append(sourceList([['Fuente de la ubicación',firstSource[1]]]));
    }
    return;
  }
  const summary = html('div',null,'result');
  summary.append(html('h3',record.result ? 'Mediciones de la campaña' : 'Registro de campo'),
    html('p',record.result ?? record.description));
  detail.replaceChildren(header,drawComparison(record),summary);
  if (record.result) detail.append(html('p',record.description,'muted'));
  detail.append(html('h3','Fuentes de esta ubicación'),sourceList(record.links),
    html('small',record.precise ? 'Coordenadas publicadas del sitio' : 'Punto aproximado para la ciudad o el proyecto','muted'));
}
function findRecords() {
  const text = normalize(query.value.trim());
  return records.filter(point => state.active.has(point.groupId) &&
    (!text || normalize([point.place,registry[point.groupId].name,point.model ?? '',point.description].join(' ')).includes(text)));
}
function normalize(text) {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase();
}
function drawList() {
  const filtered = findRecords();
  document.getElementById('count').textContent = filtered.length + ' de ' + records.length;
  results.replaceChildren();
  if (!filtered.length) results.append(html('p','No hay coincidencias.','muted'));
  for (const point of filtered) {
    const button = html('button',null,'row');
    button.type = 'button';
    button.setAttribute('aria-current',String(point === state.selected));
    const text = html('span',point.place);
    text.append(html('small',point.model ?? registry[point.groupId].name));
    button.append(swatch(point.groupId),text);
    button.addEventListener('click',() => select(point,true));
    results.append(button);
  }
}
function select(point,focusMap) {
  state.selected = point;
  drawDetail(point);
  if (placePicker) {
    placePicker.value = point.id;
  } else {
    const filtered = findRecords();
    for (const [i,button] of Array.from(results.children).entries()) {
      if (button.matches('button')) button.setAttribute('aria-current',String(filtered[i] === point));
    }
  }
  if (focusMap) {
    [state.lon,state.lat] = point.coordinates;
    state.zoom = point.groupId === 5 ? 245 : 18;
  }
  schedule();
}
function drawBibliography() {
  registry.forEach((group,i) => {
    const section = html('section');
    const heading = html('h3');
    heading.append(swatch(i),document.createTextNode(group.name));
    const links = new Map();
    for (const point of records.filter(p=>p.groupId===i)) {
      for (const [label,url] of point.links) links.set(url,label);
    }
    for (const [label,url] of [...group.networks,...group.studies]) links.set(url,label);
    section.append(heading,html('p',group.summary,'muted'),sourceList(Array.from(links,([url,label])=>[label,url])));
    document.getElementById('refs').append(section);
  });
}
function newProjection(w,h) {
  const translate = [w/2,h/2];
  const p = state.mode === 'globe'
    ? d3.geoOrthographic().rotate([-state.lon,-state.lat]).scale(Math.min(w,h)*.46*state.zoom)
    : d3.geoEquirectangular().rotate([-state.lon,0]).center([0,state.lat]).scale(Math.min(w/(2*Math.PI),h/Math.PI)*.94*state.zoom);
  return p.translate(translate).clipExtent([[0,0],[w,h]]);
}
function visible(coordinates) {
  if (state.mode === 'globe' && d3.geoDistance([state.lon,state.lat],coordinates)>Math.PI/2) return null;
  const [x,y] = projection(coordinates);
  return x>9 && y>10 && x<size[0]-9 && y<size[1]-10 ? [x,y] : null;
}
function drawMap() {
  frame = null;
  const {width:w,height:h} = map.getBoundingClientRect();
  if (!w || !h) return;
  size = [w,h];
  projection = newProjection(w,h);
  const path = d3.geoPath(projection);
  map.setAttribute('viewBox','0 0 '+w+' '+h);
  const geometry = [
    svgNode('path',{class:'sphere',d:path(sphere) ?? ''}),
    svgNode('path',{class:'country',d:path(allCountries) ?? ''}),
    svgNode('path',{class:'country colombia',d:path(colombia) ?? ''}),
    svgNode('path',{class:'equator',d:path(equator) ?? ''})
  ];
  if (state.zoom>=12) geometry.push(svgNode('path',{class:'municipal',d:path(municipalBoundaries) ?? ''}));
  const clusters = [];
  for (const point of records) {
    if (!state.active.has(point.groupId)) continue;
    const position = visible(point.coordinates);
    if (!position) continue;
    const [x,y] = position;
    const cluster = clusters.find(p => Math.hypot(p.x-x,p.y-y)<23);
    if (cluster) cluster.items.push({point,x,y});
    else clusters.push({x,y,items:[{point,x,y}]});
  }
  const symbols = svgNode('g',{'aria-label':'Puntos de los sensores'});
  const labels = svgNode('g',{'aria-hidden':'true'});
  const occupied = [];
  function label(name,x,y,className) {
    const width = name.length*7.05;
    const left = x+width+10>w ? x-width-5 : x+7;
    if (left<0) return;
    for (const shift of [0,16,-16,32]) {
      const baseline = y+shift, top = baseline-14;
      if (top<0 || baseline>h-3 || occupied.some(box=>left<box.r && left+width>box.l && top<box.b && baseline>box.t)) continue;
      occupied.push({l:left-3,r:left+width+4,t:top-2,b:baseline+3});
      labels.append(svgNode('text',{x:left,y:baseline,class:className},name));
      return;
    }
  }
  clusters.sort((a,b)=>Number(b.items.some(x=>x.point===state.selected))-Number(a.items.some(x=>x.point===state.selected)));
  for (const cluster of clusters) {
    const {items} = cluster;
    const current = items.find(p=>p.point===state.selected) ?? items[0];
    const radius = items.length>1 ? Math.max(9,items.length*2.35) : 0;
    const x0 = Math.min(w-radius-10,Math.max(radius+10,cluster.x));
    const y0 = Math.min(h-radius-10,Math.max(radius+10,cluster.y));
    const aburra = items.every(x=>x.point.groupId===5);
    const labelText = items.length === 1 ? current.point.label :
      (aburra && items.length>=4 ? 'Valle de Aburrá' : current.point.label) + ' · '+items.length;
    label(labelText,x0+radius,y0-radius-6,'site-label');
    items.forEach(({point,x,y},i)=>{
      const angle = 2*Math.PI*i/items.length-Math.PI/2;
      const dx = x0+radius*Math.cos(angle), dy = y0+radius*Math.sin(angle);
      const color = colors[point.groupId];
      const group = svgNode('g',{class:'point','data-point':point.id});
      if (Math.hypot(dx-x,dy-y)>6) group.append(svgNode('line',{x1:x,y1:y,x2:dx,y2:dy,class:'leader'}));
      group.append(svgNode('circle',{cx:dx,cy:dy,r:9,fill:'transparent'}));
      if (point===state.selected) group.append(svgNode('circle',{cx:dx,cy:dy,r:9,fill:'none',stroke:'#142f48','stroke-width':1.6}));
      group.append(svgNode('circle',{class:'symbol',cx:dx,cy:dy,r:6,
        fill:point.status==='exact'?color:'#fff',stroke:point.status==='exact'?'#fff':color,'stroke-width':2,
        'stroke-dasharray':point.status==='exact'?'none':'3 2'}));
      group.addEventListener('pointerenter',()=>{
        tip.textContent=point.place+' · '+shortNames[point.groupId];
        tip.style.left=Math.max(8,Math.min(w-190,dx+12))+'px';
        tip.style.top=Math.max(6,dy-39)+'px';
        tip.hidden=false;
      });
      group.addEventListener('pointerleave',()=>{tip.hidden=true;});
      group.addEventListener('click',()=>{
        if (moved) return;
        select(point,false);
        if (!placePicker && window.matchMedia('(max-width:900px)').matches) detail.scrollIntoView({block:'nearest'});
      });
      symbols.append(group);
    });
  }
  if (state.zoom>=2) {
    for (const [name,lon,lat] of contextCities) {
      const position = visible([lon,lat]);
      if (!position || clusters.some(c=>c.items.some(item=>item.point.label===name))) continue;
      labels.append(svgNode('circle',{cx:position[0],cy:position[1],r:2,class:'city-dot'}));
      label(name,position[0],position[1]-4,'city-label');
    }
  }
  map.replaceChildren(...geometry,labels,symbols);
}
function schedule() {
  if (frame == null) frame = requestAnimationFrame(drawMap);
}
const clamp = (value,min,max) => Math.min(max,Math.max(min,value));
function zoom(factor,event) {
  if (!projection) return;
  let anchor;
  if (event && state.mode==='flat') {
    const rect = map.getBoundingClientRect();
    const cursor = [event.clientX-rect.left,event.clientY-rect.top];
    anchor = [cursor,projection.invert(cursor)];
  }
  state.zoom = clamp(state.zoom*factor,.62,650);
  if (anchor) {
    const [cursor,before] = anchor;
    const after = newProjection(...size).invert(cursor);
    state.lon += ((before[0]-after[0]+540)%360)-180;
    state.lat = clamp(state.lat+before[1]-after[1],-84,84);
  }
  tip.hidden=true;
  schedule();
}
function move(dx,dy,scale) {
  const degrees = 180/(Math.PI*scale);
  state.lon = ((state.lon-dx*degrees+540)%360)-180;
  state.lat = clamp(state.lat+dy*degrees,-84,84);
  schedule();
}
map.addEventListener('pointerdown',event=>{
  moved=false;
  if (event.button!==0 || event.target.closest('.point')) return;
  drag=[event.clientX,event.clientY];
  map.setPointerCapture(event.pointerId);
  map.classList.add('dragging');
});
map.addEventListener('pointermove',event=>{
  if (!drag || !projection) return;
  const dx=event.clientX-drag[0],dy=event.clientY-drag[1];
  moved ||= Math.abs(dx)+Math.abs(dy)>1;
  drag=[event.clientX,event.clientY];
  move(dx,dy,projection.scale());
});
for (const action of ['pointerup','pointercancel','lostpointercapture']) {
  map.addEventListener(action,()=>{drag=null;map.classList.remove('dragging');});
}
map.addEventListener('wheel',event=>{event.preventDefault();zoom(Math.exp(-clamp(event.deltaY,-180,180)*.003),event);},{passive:false});
map.addEventListener('dblclick',event=>{if (!event.target.closest('.point')) zoom(1.7,event);});
map.addEventListener('keydown',event=>{
  const delta = {ArrowLeft:[42,0],ArrowRight:[-42,0],ArrowUp:[0,42],ArrowDown:[0,-42]}[event.key];
  if (delta) move(...delta,projection.scale());
  else if (['+','=','-'].includes(event.key)) zoom(event.key==='-'?1/1.45:1.45);
  else return;
  event.preventDefault();
});
document.querySelectorAll('[data-mode]').forEach(button=>button.addEventListener('click',()=>{
  const next=button.dataset.mode;
  if (state.mode===next) return;
  state.zoom=clamp(state.zoom*(next==='globe'?.48:2.08),.62,650);
  state.mode=next;
  document.querySelectorAll('[data-mode]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));
  schedule();
}));
document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>{
  [state.lon,state.lat,state.zoom]=views[button.dataset.view];
  if (state.mode==='globe') state.zoom=Math.max(1,state.zoom*.48);
  schedule();
}));
document.querySelectorAll('[data-zoom]').forEach(button=>button.addEventListener('click',()=>zoom(1.45**Number(button.dataset.zoom))));
function populatePlaces() {
  placePicker.replaceChildren();
  for (const [index,name] of shortNames.entries()) {
    if (!state.active.has(index)) continue;
    const group = html('optgroup');
    group.label = name;
    for (const point of records.filter(p=>p.groupId===index)) {
      group.append(new Option(point.place,point.id));
    }
    placePicker.append(group);
  }
  placePicker.disabled = state.active.size===0;
  placePicker.value = state.selected?.id ?? '';
}
function refreshCompactFilters() {
  const allActive = state.active.size===registry.length;
  legend.dataset.filtered = String(!allActive);
  for (const button of legend.querySelectorAll('button')) {
    const key = button.dataset.sensor;
    const selected = key==='all' ? allActive : key==='none' ? state.active.size===0 : state.active.has(Number(key));
    button.setAttribute('aria-pressed',String(selected));
  }
  if (!state.selected || !state.active.has(state.selected.groupId)) {
    const center = [state.lon,state.lat];
    const next = records.filter(point=>state.active.has(point.groupId))
      .sort((a,b)=>d3.geoDistance(center,a.coordinates)-d3.geoDistance(center,b.coordinates))[0];
    if (next) select(next,false);
    else {
      state.selected = null;
      detail.replaceChildren(html('h2','Sin sensores seleccionados'));
    }
  }
  populatePlaces();
  tip.hidden = true;
  schedule();
}
if (placePicker) {
  const all = html('button','Seleccionar todos','key');
  all.type='button';
  all.dataset.sensor='all';
  all.setAttribute('aria-pressed','true');
  all.addEventListener('click',()=>{
    state.active = new Set(registry.map((_,i)=>i));
    refreshCompactFilters();
  });
  const none = html('button','Deseleccionar todos','key');
  none.type='button';
  none.dataset.sensor='none';
  none.setAttribute('aria-pressed','false');
  none.addEventListener('click',()=>{
    state.active.clear();
    refreshCompactFilters();
  });
  legend.append(all,none);
  placePicker.addEventListener('change',()=>{
    const record = records.find(point=>point.id===placePicker.value);
    if (record) select(record,true);
  });
}
registry.forEach((group,i)=>{
  const button=html('button',null,'key');
  button.type='button';
  button.dataset.sensor=i;
  button.setAttribute('aria-pressed','true');
  button.setAttribute('aria-label',group.name);
  button.append(swatch(i),document.createTextNode(shortNames[i]));
  button.addEventListener('click',()=>{
    if (placePicker) {
      if (state.active.has(i)) state.active.delete(i); else state.active.add(i);
      refreshCompactFilters();
      return;
    }
    if (state.active.has(i)) state.active.delete(i); else state.active.add(i);
    button.setAttribute('aria-pressed',String(state.active.has(i)));
    drawList();
    schedule();
  });
  legend.append(button);
});
if (placePicker) {
  populatePlaces();
} else {
  query.addEventListener('input',drawList);
  drawBibliography();
  drawList();
}
drawDetail(state.selected);
new ResizeObserver(schedule).observe(map);
schedule();
