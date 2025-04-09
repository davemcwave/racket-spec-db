const tableHead = document.getElementById('table-head');
const tableBody = document.getElementById('table-body');
const fieldToggles = document.getElementById('field-toggles');
const globalFilter = document.getElementById('global-filter');
let searchHistory = JSON.parse(localStorage.getItem('searchHistory') || '[]');

globalFilter.focus();

let data = [];
let visibleFields = new Set();

const searchKeyAliases = {
  head_size_in: "Head Size (in\u00b2)",
  head_size_cm: "Head Size (cm\u00b2)",
  length_in: "Length (in)",
  length_cm: "Length (cm)",
  strung_weight_oz: "Strung Weight (oz)",
  strung_weight_g: "Strung Weight (g)",
  balance_in: "Balance (in)",
  balance_cm: "Balance (cm)",
  balance_pts: "Balance (pts HL)",
  swingweight: "Swingweight",
  stiffness: "Stiffness",
  composition: "Composition",
  power_level: "Power Level",
  stroke_style: "Stroke Style",
  swing_speed: "Swing Speed",
  racquet_colors: "Racquet Colors",
  grip_type: "Grip Type",
  string_tension: "String Tension",
  pros: "Pros",
  tw_review: "TW Review",
  tw_review_count: "TW Review Count",
  tw_price: "TW Price (USD)",
  tennis_express_price: "Tennis Express Price",
  tennis_express_review: "Tennis Express Review",
  tennis_express_review_count: "Tennis Express Review Count",
  racket_name: "Racket Name",
  beam_width_1: "Beam Width 1 (mm)",
  beam_width_2: "Beam Width 2 (mm)",
  beam_width_3: "Beam Width 3 (mm)",
  string_mains: "String Mains",
  string_crosses: "String Crosses"
};

const reversedAliases = Object.fromEntries(
  Object.entries(searchKeyAliases).map(([k, v]) => [v, k])
);

const defaultVisibleFields = [
  "Racket Name", "Head Size (in\u00b2)", "Length (in)", 
  "Strung Weight (oz)", "Balance (pts HL)", "Swingweight", "Stiffness", "Grip Type", "String Mains", "String Crosses"
];

fetch('./data/rackets.json?' + Date.now())
  .then(res => res.json())
  .then(json => {
    data = json;

    const urlParams = new URLSearchParams(window.location.search);
    const initialSearch = urlParams.get("search");
    const initialFields = urlParams.get("fields");

    if (initialSearch) {
      globalFilter.value = initialSearch.replace(/\+/g, ' ');
    }



    if (initialFields) {
      const parsed = initialFields.split(',').map(f => f.trim());
      const translated = parsed.map(alias => searchKeyAliases[alias] || alias);
      visibleFields = new Set(translated);
    }
    


    const savedFields = JSON.parse(localStorage.getItem('visibleFields') || 'null');
    visibleFields = new Set(savedFields || defaultVisibleFields);

    const keys = Object.keys(data[0]).sort((a, b) => a.localeCompare(b));

    fieldToggles.innerHTML = keys.map(key => {
      const checked = visibleFields.has(key) ? 'checked' : '';
      return `<label><input type="checkbox" class="toggle-field" value="${key}" ${checked}/> ${key}</label>`;
    }).join('');

    document.querySelectorAll('.toggle-field').forEach(input => {
      input.addEventListener('change', () => {
        if (input.checked) visibleFields.add(input.value);
        else visibleFields.delete(input.value);
  
        // 🔐 Save current visible fields
        localStorage.setItem('visibleFields', JSON.stringify(Array.from(visibleFields)));

        renderTable(applyFilter());
        updateURLParams();

      });
    });

    const historyDropdown = document.createElement('select');
    historyDropdown.className = 'mb-4 p-2 border border-zinc-600 rounded bg-zinc-800 text-zinc-100 text-sm';
    historyDropdown.innerHTML = '<option value="">Search history</option>' +
      searchHistory.map(v => `<option value="${v}">${v}</option>`).join('');
    const searchBtn = document.createElement('button');
    searchBtn.textContent = 'Search';
    searchBtn.className = 'ml-2 px-4 py-2 bg-lime-700 text-white rounded hover:bg-lime-600';
    searchBtn.addEventListener('click', () => renderTable(applyFilter()));
    globalFilter.insertAdjacentElement('afterend', searchBtn);
    globalFilter.insertAdjacentElement('afterend', historyDropdown);


    historyDropdown.addEventListener('change', () => {
      if (historyDropdown.value) {
        globalFilter.value = historyDropdown.value;
        renderTable(applyFilter());
      }
    });

    globalFilter.placeholder = "Try: head_size_in=98 swingweight>320";
    globalFilter.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const val = globalFilter.value.trim();
      if (val && !searchHistory.includes(val)) {
        searchHistory.unshift(val);
        localStorage.setItem('searchHistory', JSON.stringify(searchHistory));
        historyDropdown.innerHTML = '<option value="">Search history</option>' +
          searchHistory.map(v => `<option value="${v}">${v}</option>`).join('');
      }
      renderTable(applyFilter());
      updateURLParams();

    });

    document.getElementById('reset-columns').addEventListener('click', () => {
      visibleFields = new Set(defaultVisibleFields);
      localStorage.setItem('visibleFields', JSON.stringify(Array.from(visibleFields)));
    
      // Re-check the boxes
      document.querySelectorAll('.toggle-field').forEach(input => {
        input.checked = visibleFields.has(input.value);
      });
    
      renderTable(applyFilter());
      updateURLParams();

    });

    document.getElementById('reset-columns').addEventListener('click', () => {
      document.getElementById('column-toggles').open = true;
    
      visibleFields = new Set(defaultVisibleFields);
      localStorage.setItem('visibleFields', JSON.stringify(Array.from(visibleFields)));
    
      document.querySelectorAll('.toggle-field').forEach(input => {
        input.checked = visibleFields.has(input.value);
      });
    
      renderTable(applyFilter());
    });
    
    
    document.getElementById('select-all-columns').addEventListener('click', () => {
      document.getElementById('column-toggles').open = true;
    
      const ordered = ["Racket Name", ...keys.filter(k => k !== "Racket Name")];
      visibleFields = new Set(ordered);
      localStorage.setItem('visibleFields', JSON.stringify(Array.from(visibleFields)));
    
      document.querySelectorAll('.toggle-field').forEach(input => {
        input.checked = true;
      });
    
      renderTable(applyFilter());
      updateURLParams();

    });
    

    document.getElementById('unselect-all-columns').addEventListener('click', () => {
      document.getElementById('column-toggles').open = true;
    
      visibleFields = new Set(["Racket Name"]);
      localStorage.setItem('visibleFields', JSON.stringify(Array.from(visibleFields)));
    
      document.querySelectorAll('.toggle-field').forEach(input => {
        input.checked = input.value === "Racket Name";
      });
    
      renderTable(applyFilter());
      updateURLParams();

    });
    

    
    
    
    

    renderTable(applyFilter());
    
  });

function applyFilter() {
  const input = globalFilter.value.trim().toLowerCase();
  if (!input) return data;

  const tokens = input.match(/!?[\w\s]+[><=~]"[^"]+"|!?[\w\s]+[><=~][^\s"]+|\S+/g) || [];

  return data.filter(row => {
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
          searchKeyAliases[key] ||
          searchKeyAliases[normalizedKey] ||
          Object.keys(row).find(k => k.toLowerCase() === key.toLowerCase());

        const fieldVal = String(row[lookupKey] ?? '').toLowerCase();

        let result = false;
        if (op === '=') {
          result = fieldVal === val || val.split(',').some(v => fieldVal.includes(v));
        } else if (op === '~') {
          result = fieldVal.includes(val);
        } else if (op === '>' || op === '<') {
          const numVal = parseFloat(val);
          const actualVal = parseFloat(fieldVal);
          if (!isNaN(numVal) && !isNaN(actualVal)) {
            result = op === '>' ? actualVal > numVal : actualVal < numVal;
          }
        }

        return negate ? !result : result;
      } else {
        return Object.values(row).some(v => String(v).toLowerCase().includes(token));
      }
    });
  });
}

function renderTable(rows) {
  const fields = Array.from(visibleFields);
  let currentSort = { key: null, dir: 'asc' };

  tableHead.innerHTML = fields.map((key) => {
    const isSticky = key === "Racket Name";
    const stickyClass = isSticky ? 'sticky-col bg-lime-800' : '';
    const searchKey = reversedAliases[key] || key.replace(/\s+/g, "_").toLowerCase();
    return `<th class="p-2 text-left ${stickyClass}">${key}
      <span class="inline-block w-5 h-5 rounded-full bg-zinc-600 text-white text-xs font-bold text-center leading-5 cursor-help" title="Search: ${searchKey}">i</span>
    </th>`;
  }).join('');

  tableBody.innerHTML = rows.map(row => {
    return `<tr class="border-t border-zinc-700 hover:bg-zinc-700">` +
      fields.map(key => {
        const isSticky = key === "Racket Name";
        const stickyClass = isSticky ? 'sticky-col bg-zinc-800' : '';
        const val = Array.isArray(row[key]) ? row[key].join(", ") : row[key];
        return `<td class="p-2 ${stickyClass}">${val}</td>`;
      }).join('') + `</tr>`;
  }).join('');
}

function updateURLParams() {
  const currentSearch = globalFilter.value.trim();
  const currentFields = Array.from(visibleFields)
    .map(f => reversedAliases[f] || f.replace(/\s+/g, "_").toLowerCase())
    .join(',');

  // Don't encode "=" or ">" or "," or spaces — just use raw search string
  let query = [];

  if (currentSearch) query.push(`search=${currentSearch.replace(/\s+/g, '+')}`);
  if (currentFields) query.push(`fields=${currentFields}`);

  const newURL = `${window.location.pathname}${query.length ? '?' + query.join('&') : ''}`;
  window.history.replaceState({}, '', newURL);
}



function exportToCSV() {
  const rows = applyFilter();
  const fields = Array.from(visibleFields);

  const csv = [fields.join(',')].concat(
    rows.map(row =>
      fields.map(f => JSON.stringify(row[f] ?? '')).join(',')
    )
  ).join('\n');

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'rackets.csv';
  a.click();
  URL.revokeObjectURL(url);
}


tableHead.querySelectorAll('th').forEach(th => {
  th.addEventListener('click', () => {
    const key = th.textContent.trim();
    const dir = (currentSort.key === key && currentSort.dir === 'asc') ? 'desc' : 'asc';
    currentSort = { key, dir };

    const sortedRows = [...applyFilter()].sort((a, b) => {
      const aVal = a[key] ?? '';
      const bVal = b[key] ?? '';
      const aNum = parseFloat(aVal);
      const bNum = parseFloat(bVal);
      const isNum = !isNaN(aNum) && !isNaN(bNum);
      if (isNum) {
        return dir === 'asc' ? aNum - bNum : bNum - aNum;
      } else {
        return dir === 'asc'
          ? String(aVal).localeCompare(String(bVal))
          : String(bVal).localeCompare(String(aVal));
      }
    });

    renderTable(sortedRows);
  });
});

document.getElementById('export-btn').addEventListener('click', () => {
  const rows = applyFilter();
  const fields = Array.from(visibleFields);

  const csv = [fields.join(',')].concat(
    rows.map(row =>
      fields.map(f => JSON.stringify(row[f] ?? '')).join(',')
    )
  ).join('\n');

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'rackets.csv';
  a.click();
  URL.revokeObjectURL(url);
});

