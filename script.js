const tableHead = document.getElementById('table-head');
const tableBody = document.getElementById('table-body');
const fieldToggles = document.getElementById('field-toggles');
const globalFilter = document.getElementById('global-filter');
// Use the correct button IDs from your HTML.
const resetFieldsBtn = document.getElementById('reset-columns');
const selectAllBtn = document.getElementById('select-all-columns');
const unselectAllBtn = document.getElementById('unselect-all-columns');

let searchHistory = JSON.parse(localStorage.getItem('searchHistory') || '[]');

// Focus search input immediately.
globalFilter.focus();

let data = [];
let currentPage = 1;
let rowsPerPage = parseInt(localStorage.getItem("rowsPerPage") || "10");
let filteredRows = [];

// Include "racket_name" in the default visible fields so it always shows up.
const defaultVisibleFields = [
  "racket_name", "head_size_in", "length_in", 
  "weight_oz", "balance_pts", "swingweight", "stiffness", "grip_type", "string_mains", "string_crosses"
];

let visibleFields = new Set();

// Map normalized keys to friendly display names.
const searchKeyAliases = {
  balance_cm: "Balance (cm)",
  balance_in: "Balance (in)",
  balance_pts: "Balance (pts HL)",
  beam_width_1: "Beam Width 1 (mm)",
  beam_width_2: "Beam Width 2 (mm)",
  beam_width_3: "Beam Width 3 (mm)",
  composition: "Composition",
  grip_type: "Grip Type",
  head_size_cm: "Head Size (cm²)",
  head_size_in: "Head Size (in²)",
  length_cm: "Length (cm)",
  length_in: "Length (in)",
  manufacturer: "Manufacturer",
  power_level: "Power Level",
  racket_name: "Racket Name",
  racquet_colors: "Racquet Colors",
  stiffness: "Stiffness",
  string_tension: "String Tension",
  string_mains: "String Mains",
  string_crosses: "String Crosses",
  stringing_instructions: "Stringing Instructions",
  stroke_style: "Stroke Style",
  swing_speed: "Swing Speed",
  swingweight: "Swingweight",
  weight_g: "Strung Weight (g)",
  weight_oz: "Strung Weight (oz)"
};

// Build a reversed mapping (Display name -> normalized key)
const reversedAliases = Object.fromEntries(
  Object.entries(searchKeyAliases).map(([k, v]) => [v, k])
);

fetch('./data/rackets.json?' + Date.now())
  .then(res => res.json())
  .then(json => {
    data = json;

    const urlParams = new URLSearchParams(window.location.search);
    const initialSearch = urlParams.get("search");
    const initialFields = urlParams.get("fields");

    if (initialSearch) globalFilter.value = initialSearch.replace(/\+/g, ' ');
    if (initialFields) {
      // Map display field names from URL back to normalized keys.
      const parsed = initialFields.split(',').map(f => f.trim());
      const translated = parsed.map(alias => reversedAliases[alias] || alias.replace(/\s+/g, "_").toLowerCase());
      visibleFields = new Set(translated);
    } else {
      const savedFields = JSON.parse(localStorage.getItem('visibleFields') || 'null');
      visibleFields = new Set(savedFields || defaultVisibleFields);
    }
    // Always force "racket_name" to be visible.
    visibleFields.add("racket_name");
    
    rebuildFieldToggles();
    renderTable(applyFilter());
    document.getElementById("rows-per-page").value = rowsPerPage;

    globalFilter.placeholder = "Try: head_size_in=98 swingweight>320";
    globalFilter.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        const val = globalFilter.value.trim();
        if (val && !searchHistory.includes(val)) {
          searchHistory.unshift(val);
          localStorage.setItem('searchHistory', JSON.stringify(searchHistory));
        }
        renderTable(applyFilter());
        updateURLParams();
      }
    });
  });

function rebuildFieldToggles() {
  const keys = Object.keys(data[0]).sort();
  fieldToggles.innerHTML = keys.map(key => {
    const displayName = searchKeyAliases[key] || key;
    // Always check "racket_name" and disable it so it can't be toggled.
    if(key === "racket_name"){
      return `<label><input type="checkbox" class="toggle-field" value="${key}" checked disabled/> ${displayName}</label>`;
    }
    const checked = visibleFields.has(key) ? 'checked' : '';
    return `<label><input type="checkbox" class="toggle-field" value="${key}" ${checked}/> ${displayName}</label>`;
  }).join('');

  document.querySelectorAll('.toggle-field').forEach(input => {
    // Do not attach event listener to disabled inputs.
    if(input.disabled) return;
    input.addEventListener('change', () => {
      if (input.checked) {
        visibleFields.add(input.value);
      } else {
        visibleFields.delete(input.value);
      }
      // Always force "racket_name" to remain visible.
      visibleFields.add("racket_name");
      localStorage.setItem('visibleFields', JSON.stringify([...visibleFields]));
      renderTable(applyFilter());
      updateURLParams();
    });
  });
}

// Event listeners for reset, select-all, and unselect-all buttons.
if (resetFieldsBtn) {
  resetFieldsBtn.addEventListener('click', () => {
    visibleFields = new Set(defaultVisibleFields);
    // Ensure "racket_name" is always visible.
    visibleFields.add("racket_name");
    localStorage.setItem('visibleFields', JSON.stringify([...visibleFields]));
    rebuildFieldToggles();
    renderTable(applyFilter());
    updateURLParams();
  });
}

if (selectAllBtn) {
  selectAllBtn.addEventListener('click', () => {
    const allKeys = Object.keys(data[0]);
    visibleFields = new Set(allKeys);
    // Always include "racket_name"
    visibleFields.add("racket_name");
    localStorage.setItem('visibleFields', JSON.stringify([...visibleFields]));
    rebuildFieldToggles();
    renderTable(applyFilter());
    updateURLParams();
  });
}

if (unselectAllBtn) {
  unselectAllBtn.addEventListener('click', () => {
    visibleFields = new Set();
    // Even when unselecting all, force "racket_name" to be visible.
    visibleFields.add("racket_name");
    localStorage.setItem('visibleFields', JSON.stringify([...visibleFields]));
    rebuildFieldToggles();
    renderTable(applyFilter());
    updateURLParams();
  });
}

function applyFilter() {
  const input = globalFilter.value.trim().toLowerCase();
  if (!input) {
    currentPage = 1;
    filteredRows = data;
    return filteredRows;
  }
  const tokens = input.match(/!?[\w\s]+[><=~]"[^"]+"|!?[\w\s]+[><=~][^\s"]+|\S+/g) || [];
  filteredRows = data.filter(row => {
    return tokens.every(token => {
      let negate = false;
      if (token.startsWith('!')) {
        negate = true;
        token = token.slice(1);
      }
      const opMatch = token.match(/([\w\s]+)([><=~])(.*)/);
      if (opMatch) {
        const [, rawKey, op, rawVal] = opMatch;
        const key = rawKey.trim();
        const val = rawVal.trim().replace(/^"(.*)"$/, "$1");
        const normalizedKey = key.toLowerCase().replace(/\s+/g, "_");
        const lookupKey =
          normalizedKey in searchKeyAliases ? normalizedKey :
          Object.keys(row).find(k => k.toLowerCase() === normalizedKey);
        const fieldVal = row[lookupKey];
        if (fieldVal == null) return false;
        const fieldStr = String(fieldVal).toLowerCase();
        const valStr = val.toLowerCase();
        const fieldNum = parseFloat(fieldVal);
        const valNum = parseFloat(val);
        let result = false;
        if (op === '=') {
          result = (!isNaN(fieldNum) && !isNaN(valNum)) ? fieldNum === valNum : fieldStr === valStr;
        } else if (op === '~') {
          result = fieldStr.includes(valStr);
        } else if ((op === '>' || op === '<') && !isNaN(fieldNum) && !isNaN(valNum)) {
          result = op === '>' ? fieldNum > valNum : fieldNum < valNum;
        }
        return negate ? !result : result;
      }
      return Object.values(row).some(v => String(v ?? '').toLowerCase().includes(token));
    });
  });
  currentPage = 1;
  return filteredRows;
}

function renderTable(rows) {
  const fields = [...visibleFields];
  const start = (currentPage - 1) * rowsPerPage;
  const end = start + rowsPerPage;
  const pageRows = rows.slice(start, end);

  tableHead.innerHTML = fields.map(key => {
    const displayName = searchKeyAliases[key] || key;
    const isSticky = key === "racket_name";
    // "racket_name" will be rendered with its sticky style if desired.
    const stickyClass = isSticky ? 'sticky-col bg-lime-800' : '';
    const searchKey = reversedAliases[displayName] || key;
    return `<th class="p-2 text-left ${stickyClass}">${displayName}<span class="inline-block w-5 h-5 rounded-full bg-zinc-600 text-white text-xs font-bold text-center leading-5 cursor-help" title="Search: ${searchKey}">i</span></th>`;
  }).join('');

  tableBody.innerHTML = pageRows.map(row => {
    return `<tr class="border-t border-zinc-700 hover:bg-zinc-700">` +
      fields.map(key => {
        const isSticky = key === "racket_name";
        const stickyClass = isSticky ? 'sticky-col bg-zinc-800' : '';
        const val = Array.isArray(row[key]) ? row[key].join(", ") : row[key];
        return `<td class="p-2 ${stickyClass}">${val}</td>`;
      }).join('') + `</tr>`;
  }).join('');

  const totalPages = Math.ceil(rows.length / rowsPerPage);
  document.getElementById("page-info").textContent = `Page ${currentPage} of ${totalPages}`;
  document.getElementById("prev-page").disabled = currentPage <= 1;
  document.getElementById("next-page").disabled = currentPage >= totalPages;
}

document.getElementById('prev-page').addEventListener('click', () => {
  if (currentPage > 1) {
    currentPage--;
    renderTable(filteredRows);
  }
});

document.getElementById('next-page').addEventListener('click', () => {
  const totalPages = Math.ceil(filteredRows.length / rowsPerPage);
  if (currentPage < totalPages) {
    currentPage++;
    renderTable(filteredRows);
  }
});

document.getElementById('rows-per-page').addEventListener('change', (e) => {
  rowsPerPage = parseInt(e.target.value);
  localStorage.setItem('rows-per-page', rowsPerPage);
  currentPage = 1;
  renderTable(filteredRows);
});

function updateURLParams() {
  const currentSearch = globalFilter.value.trim();
  const currentFields = [...visibleFields]
    .map(f => searchKeyAliases[f] || f)
    .join(',');
  const query = [];
  if (currentSearch) query.push(`search=${currentSearch.replace(/\s+/g, '+')}`);
  if (currentFields) query.push(`fields=${currentFields}`);
  const newURL = `${window.location.pathname}${query.length ? '?' + query.join('&') : ''}`;
  window.history.replaceState({}, '', newURL);
}

document.getElementById('export-btn').addEventListener('click', (e) => {
  const rows = applyFilter();
  const fields = [...visibleFields];
  const csv = [fields.join(',')].concat(
    rows.map(row => fields.map(f => JSON.stringify(row[f] ?? '')).join(','))
  ).join('\n');

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'rackets.csv';
  a.click();
  URL.revokeObjectURL(url);
});