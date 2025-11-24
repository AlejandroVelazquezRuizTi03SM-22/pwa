// --------------------------------------------------------------------------------
// 1. CONFIGURACIÓN GLOBAL
// --------------------------------------------------------------------------------
const mainContent = document.getElementById('content');
let currentUserRole = null; 
let currentStudentId = localStorage.getItem('student_id') || '';

const INVENTORY_KEY = 'unistock_inventory';
const CART_KEY = 'unistock_loan_cart';
const ACTIVE_REQUEST_KEY = 'unistock_active_request'; // Clave para persistencia del token

// --------------------------------------------------------------------------------
// 2. GESTIÓN DE CONECTIVIDAD
// --------------------------------------------------------------------------------
function updateConnectionStatus() {
    const toast = document.getElementById('connection-toast');
    if(!toast) return;

    if (navigator.onLine) {
        toast.textContent = "🟢 Conexión Restablecida";
        toast.classList.add('online');
        toast.classList.remove('hidden');
        setTimeout(() => toast.classList.add('hidden'), 3000);
        getInventory(); // Resincronizar
    } else {
        toast.textContent = "🔴 Sin Conexión - Modo Offline";
        toast.classList.remove('online');
        toast.classList.remove('hidden');
    }
}

window.addEventListener('online', updateConnectionStatus);
window.addEventListener('offline', updateConnectionStatus);

// --------------------------------------------------------------------------------
// 3. INVENTARIO (HÍBRIDO)
// --------------------------------------------------------------------------------
const getInventory = async () => {
    // Intento Online
    if (navigator.onLine && window.db && window.firebase) {
        try {
            const { collection, getDocs } = window.firebase;
            const snap = await getDocs(collection(window.db, "inventory"));
            const remoteData = [];
            snap.forEach((doc) => remoteData.push({ id: doc.id, ...doc.data() }));
            saveInventory(remoteData);
            return remoteData;
        } catch (error) { console.warn("Offline Mode activado"); }
    }
    // Fallback Offline
    const local = localStorage.getItem(INVENTORY_KEY);
    const backup = [{ id: "demo", name: "Equipo Demo", description: "Ejemplo Offline", available: 10, total: 10, tags:["Lab"] }];
    return local ? JSON.parse(local) : backup;
};

const saveInventory = (data) => localStorage.setItem(INVENTORY_KEY, JSON.stringify(data));

// --------------------------------------------------------------------------------
// 4. CARRITO DE COMPRAS
// --------------------------------------------------------------------------------
const getCart = () => JSON.parse(localStorage.getItem(CART_KEY)) || [];
const saveCart = (c) => { localStorage.setItem(CART_KEY, JSON.stringify(c)); updateCartUI(); };

const addToCart = async (id) => {
    const inv = await getInventory();
    const prod = inv.find(p => p.id === id);
    if(!prod) return alert("Producto no encontrado");

    let cart = getCart();
    let item = cart.find(i => i.id === id);

    if(item) {
        if(item.quantity < prod.available) { item.quantity++; alert("Cantidad +1"); }
        else alert("Stock insuficiente");
    } else {
        cart.push({ id: prod.id, name: prod.name, quantity: 1, max: prod.available });
        alert("Agregado");
    }
    saveCart(cart);
};

const removeFromCart = (id) => {
    if(!confirm("¿Eliminar?")) return;
    let cart = getCart().filter(i => i.id !== id);
    saveCart(cart);
    if(document.getElementById('loan-form')) renderRequestForm();
};
const clearCart = () => { localStorage.removeItem(CART_KEY); updateCartUI(); };

// --------------------------------------------------------------------------------
// 5. SESIÓN Y NAVEGACIÓN
// --------------------------------------------------------------------------------
window.initApp = function() {
    updateConnectionStatus();
    if(localStorage.getItem('user_role')) {
        currentUserRole = localStorage.getItem('user_role');
        currentStudentId = localStorage.getItem('student_id') || '';
        updateNav();
    }
};

const updateNav = () => {
    const nav = document.getElementById('app-nav');
    if(!nav) return;

    if(currentUserRole === 'admin') {
        nav.innerHTML = `
            <a href="#" onclick="navigateTo('admin_dashboard')">📊 Dashboard</a>
            <a href="#" onclick="navigateTo('admin_inventory')">📦 Inventario</a>
            <a href="#" onclick="navigateTo('admin_validate')">✅ Validar</a>
            <a href="#" onclick="navigateTo('admin_active_loans')">🔄 Activos</a>
            <a href="#" onclick="logout()" style="background-color:#D32F2F;">Salir</a>`;
        if(document.getElementById('login-container')) navigateTo('admin_dashboard');
    } else {
        nav.innerHTML = `
            <a href="#" onclick="navigateTo('student_consult')">🔍 Material</a>
            <a href="#" onclick="navigateTo('student_request_form')">🛒 Solicitud (${getCart().length})</a>
            <a href="#" onclick="navigateTo('student_history')">📜 Historial</a>
            <a href="#" onclick="logout()" style="background-color:#D32F2F;">Salir</a>`;
        if(document.getElementById('login-container')) navigateTo('student_consult');
    }
};

window.login = (role) => {
    // LOGIN ADMIN (INPUTS)
    if(role === 'admin') {
        const passInput = document.getElementById('login-admin-pass');
        let password = passInput ? passInput.value : prompt("Contraseña:");
        if(password !== "utsjr2025") return alert("Contraseña Incorrecta");
    }
    
    // LOGIN ALUMNO (INPUTS)
    if(role === 'student') {
        const idInput = document.getElementById('login-student-id');
        let matricula = idInput ? idInput.value.trim() : prompt("Matrícula:");
        if(!matricula || matricula.length < 3) return alert("Matrícula inválida");
        
        currentStudentId = matricula;
        localStorage.setItem('student_id', matricula);
    }

    currentUserRole = role;
    localStorage.setItem('user_role', role);
    updateNav();
};

window.logout = () => {
    if(confirm("¿Cerrar sesión?")) {
        currentUserRole = null;
        localStorage.removeItem('user_role');
        location.reload();
    }
};

window.navigateTo = async (view) => {
    mainContent.innerHTML = "<div style='text-align:center; padding:50px;'><h2>Cargando...</h2></div>";
    await new Promise(r => setTimeout(r, 50));

    switch(view) {
        case 'student_consult': await renderStudentConsultation(); break;
        case 'student_request_form': renderRequestForm(); break;
        case 'student_history': await renderStudentHistory(); break;
        case 'student_active_token': renderActiveTokenView(); break;
        
        case 'admin_dashboard': await renderAdminDashboard(); break;
        case 'admin_inventory': await renderAdminInventory(); break;
        case 'admin_validate': renderAdminValidate(); break;
        case 'admin_active_loans': await renderAdminActiveLoans(); break;
        
        default: mainContent.innerHTML = "<h2>404</h2>";
    }
};

// --------------------------------------------------------------------------------
// 6. VISTAS ALUMNO
// --------------------------------------------------------------------------------
const renderStudentConsultation = async () => {
    const items = await getInventory();
    
    // Botón Token Persistente
    const savedToken = localStorage.getItem(ACTIVE_REQUEST_KEY);
    let tokenBtn = '';
    if (savedToken) {
        tokenBtn = `
        <button onclick="navigateTo('student_active_token')" 
            style="width:100%; margin-bottom:15px; background-color:#FF9800; color:white; padding:15px; border:none; border-radius:8px; font-weight:bold;">
            🎟️ VER CÓDIGO ACTIVO
        </button>`;
    }

    mainContent.innerHTML = `
        <h2>Consulta de Material</h2>
        ${tokenBtn}
        <div class="search-container">
            <input type="text" id="search" class="search-input" placeholder="🔍 Buscar...">
        </div>
        <div id="list" class="inventory-list"></div>
        <button id="fab-cart" onclick="navigateTo('student_request_form')">📋 Ver Solicitud (${getCart().length})</button>
    `;

    const draw = (list) => {
        document.getElementById('list').innerHTML = list.length ? list.map(i => `
            <div class="material-card">
                <h3>${i.name}</h3>
                <p class="desc">${i.description || ''}</p>
                <div class="tags-container">${i.tags ? i.tags.map(t=>`<span class="tag">${t}</span>`).join('') : ''}</div>
                <p>Disp: <strong>${i.available}</strong> / ${i.total}</p>
                ${i.available > 0 ? `<button onclick="addToCart('${i.id}')">Agregar</button>` : '<button disabled>Agotado</button>'}
            </div>`).join('') : "<p>Sin resultados</p>";
    };
    draw(items);
    document.getElementById('search').addEventListener('input', (e) => {
        const q = e.target.value.toLowerCase();
        draw(items.filter(i => i.name.toLowerCase().includes(q) || (i.tags && i.tags.some(t=>t.toLowerCase().includes(q)))));
    });
    updateCartUI();
};

const updateCartUI = () => {
    const links = document.querySelectorAll('nav a');
    if(links.length > 1 && currentUserRole === 'student') links[1].innerText = `Solicitud (${getCart().length})`;
    const fab = document.getElementById('fab-cart');
    if(fab) fab.innerText = `📋 Ver Solicitud (${getCart().length})`;
};

const renderRequestForm = () => {
    const cart = getCart();
    if(cart.length === 0) return mainContent.innerHTML = "<div style='text-align:center; margin-top:50px;'><h2>Carrito vacío</h2><button class='btn-primary' onclick=\"navigateTo('student_consult')\">Ir al Inventario</button></div>";
    const today = new Date().toISOString().split('T')[0];

    mainContent.innerHTML = `
        <h2>Completar Solicitud</h2>
        <div class="request-container">
            <div class="cart-section">
                <h3>1. Materiales</h3>
                <ul>${cart.map(i => `<li>${i.name} (x${i.quantity}) <button class="btn-remove" onclick="removeFromCart('${i.id}')">X</button></li>`).join('')}</ul>
            </div>
            <div class="form-section">
                <form id="loan-form">
                    <label>Nombre:</label><input type="text" id="s-name" required placeholder="Nombre Completo">
                    <label>Matrícula:</label><input type="text" id="s-id" value="${currentStudentId}" readonly style="background:#eee">
                    <div class="form-row"><input type="date" id="s-date" value="${today}" required><input type="text" id="s-time" placeholder="Horario" required></div>
                    <input type="text" id="s-aula" placeholder="Aula" required>
                    <input type="text" id="s-prof" placeholder="Profesor" required>
                    <button type="submit" class="btn-primary">Generar Código</button>
                </form>
            </div>
        </div>
        <div id="result-area" style="display:none; margin-top:30px; text-align:center;"></div>
    `;

    document.getElementById('loan-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const requestData = {
            studentName: document.getElementById('s-name').value,
            studentId: currentStudentId,
            date: document.getElementById('s-date').value,
            time: document.getElementById('s-time').value,
            aula: document.getElementById('s-aula').value,
            professor: document.getElementById('s-prof').value,
            items: cart,
            timestamp: Date.now()
        };

        const resultArea = document.getElementById('result-area');
        document.querySelector('.request-container').style.display = 'none';
        resultArea.style.display = 'block';
        resultArea.innerHTML = `<p>Procesando...</p>`;

        let tokenInfo = { type: 'offline', code: null, data: requestData };

        if (navigator.onLine && window.db && window.firebase) {
            try {
                const shortCode = "P-" + Math.floor(1000 + Math.random() * 9000);
                await window.firebase.addDoc(window.firebase.collection(window.db, "requests"), {
                    ...requestData, code: shortCode, status: 'pending'
                });
                tokenInfo.type = 'online';
                tokenInfo.code = shortCode;
            } catch (err) { console.log("Offline fallback"); }
        }

        localStorage.setItem(ACTIVE_REQUEST_KEY, JSON.stringify(tokenInfo));
        clearCart();
        renderActiveTokenView();
    });
};

const renderActiveTokenView = () => {
    const savedToken = localStorage.getItem(ACTIVE_REQUEST_KEY);
    if (!savedToken) return navigateTo('student_consult');

    const token = JSON.parse(savedToken);
    const data = token.data;

    mainContent.innerHTML = `
        <div style="max-width:600px; margin:0 auto; background:white; padding:20px; border-radius:10px; text-align:center;">
            <h2 style="color:${token.type==='online'?'#009688':'#E65100'}">
                ${token.type==='online' ? '✅ Solicitud Enviada' : '⚠️ Token Offline'}
            </h2>
            
            ${token.type==='online' 
                ? `<div class="big-code">${token.code}</div><p style="color:#666; margin-top:20px;">Guardado en la nube.</p>` 
                : `<canvas id="qrcode" style="margin:15px auto;"></canvas><p style="color:#666;">Escanea este QR para validar.</p>`
            }

            <div style="background:#f9f9f9; padding:10px; text-align:left; margin-top:20px;">
                <p><strong>Resumen:</strong></p>
                <ul>${data.items.map(i=>`<li>${i.name} x${i.quantity}</li>`).join('')}</ul>
            </div>

            <button onclick="finishToken()" class="btn-secondary" style="margin-top:20px; color:#D32F2F; border-color:#D32F2F;">
                ❌ Cerrar Solicitud
            </button>
        </div>
    `;

    if(token.type === 'offline' && window.QRCode) {
        setTimeout(() => QRCode.toCanvas(document.getElementById('qrcode'), JSON.stringify(data), {width:250}), 100);
    }
};

window.finishToken = () => {
    if(confirm("¿Cerrar solicitud?")) {
        localStorage.removeItem(ACTIVE_REQUEST_KEY);
        navigateTo('student_consult');
    }
};

const renderStudentHistory = async () => {
    mainContent.innerHTML = `<h2>Historial</h2><p>Cargando...</p>`;
    if (!currentStudentId) return mainContent.innerHTML = `<p>Sin matrícula.</p>`;
    if (navigator.onLine && window.db && window.firebase) {
        try {
            const { collection, query, where, getDocs } = window.firebase;
            const q = query(collection(window.db, "loans"), where("studentId", "==", currentStudentId));
            const snap = await getDocs(q);
            const history = [];
            snap.forEach(d => history.push(d.data()));
            history.sort((a,b) => b.timestamp - a.timestamp);
            mainContent.innerHTML = `<h2>Historial</h2>` + (history.length ? history.map(h => `
                <div class="material-card history-card">
                    <p><strong>${new Date(h.timestamp).toLocaleDateString()}</strong> - ${h.status==='active'?'En Curso':'Devuelto'}</p>
                    <ul>${h.items.map(i=>`<li>${i.name} (x${i.quantity})</li>`).join('')}</ul>
                </div>`).join('') : "<p>Sin registros</p>");
        } catch(e) { mainContent.innerHTML = `<p>Error conexión.</p>`; }
    } else mainContent.innerHTML = `<p>No disponible offline.</p>`;
};

// --------------------------------------------------------------------------------
// 7. VISTAS ADMIN
// --------------------------------------------------------------------------------
const renderAdminValidate = () => {
    // SOLO MUESTRA OPCIÓN DE CÓDIGO (Sin JSON Pegado)
    mainContent.innerHTML = `
        <h2>Validar Préstamo</h2>
        <div class="admin-form" style="text-align:center;">
            <h3>Ingresa Código de Alumno</h3>
            <p>(Ej: P-1234)</p>
            <div style="display:flex; gap:10px; justify-content:center; margin-top:20px;">
                <input type="text" id="verify-code" placeholder="P-XXXX" style="font-size:1.5em; text-align:center; text-transform:uppercase; width:200px;">
                <button onclick="searchByCode()" class="btn-primary" style="width:auto;">Buscar</button>
            </div>
            <p style="margin-top:20px; color:#888; font-size:0.8em;">Validación Offline requiere escáner externo.</p>
        </div>
        <div id="loan-result"></div>
    `;
};

window.searchByCode = async () => {
    const code = document.getElementById('verify-code').value.toUpperCase().trim();
    if(!code) return alert("Escribe código");
    
    if (navigator.onLine && window.db && window.firebase) {
        try {
            const { collection, query, where, getDocs } = window.firebase;
            const q = query(collection(window.db, "requests"), where("code", "==", code), where("status", "==", "pending"));
            const snap = await getDocs(q);
            if (!snap.empty) showConfirmation({...snap.docs[0].data(), docId: snap.docs[0].id});
            else alert("Código no encontrado");
        } catch (e) { alert("Error conexión"); }
    } else alert("Necesitas internet");
};

const showConfirmation = (data) => {
    window.tempLoanData = data;
    document.getElementById('loan-result').innerHTML = `
        <div style="background:white; padding:20px; border:2px solid #1A237E; margin-top:20px; border-radius:8px;">
            <h3>Confirmar Entrega</h3>
            <p><strong>${data.studentName}</strong> (${data.studentId})</p>
            <p>Aula: ${data.aula}</p>
            <ul>${data.items.map(i=>`<li>${i.name} x${i.quantity}</li>`).join('')}</ul>
            <button onclick="confirmLoan()" class="btn-primary" style="background:green; margin-top:15px;">ENTREGAR MATERIAL</button>
        </div>`;
};

window.confirmLoan = async () => {
    const data = window.tempLoanData;
    if (window.db && window.firebase) {
        const { doc, getDoc, updateDoc, addDoc, collection, deleteDoc } = window.firebase;
        try {
            for (let item of data.items) {
                const ref = doc(window.db, "inventory", item.id);
                const snap = await getDoc(ref);
                if(snap.exists()) await updateDoc(ref, { available: snap.data().available - item.quantity });
            }
            await addDoc(collection(window.db, "loans"), { ...data, timestamp: Date.now(), status: 'active' });
            if(data.docId) await deleteDoc(doc(window.db, "requests", data.docId));
            alert("Éxito"); 
            localStorage.removeItem(ACTIVE_REQUEST_KEY); // Limpiar si es el mismo dispositivo
            navigateTo('admin_active_loans');
        } catch (e) { alert("Error BD"); }
    }
};

// --- ACTIVOS Y DEVOLUCIÓN ---
const renderAdminActiveLoans = async () => {
    mainContent.innerHTML = `<h2>Préstamos Activos</h2><p>Cargando...</p>`;
    if (navigator.onLine && window.db && window.firebase) {
        try {
            const { collection, query, where, getDocs } = window.firebase;
            const q = query(collection(window.db, "loans"), where("status", "==", "active"));
            const snap = await getDocs(q);
            const loans = [];
            snap.forEach(doc => loans.push({ id: doc.id, ...doc.data() }));
            mainContent.innerHTML = `<h2>Activos (${loans.length})</h2><div class="history-list">` + loans.map(loan => `
                <div class="material-card" style="border-left: 5px solid #FF9800;">
                    <div style="display:flex; justify-content:space-between;">
                        <strong>${loan.studentName}</strong><small>${new Date(loan.timestamp).toLocaleDateString()}</small>
                    </div>
                    <p style="font-size:0.9em;">Aula: ${loan.aula}</p>
                    <ul>${loan.items.map(i => `<li>${i.name} (x${i.quantity})</li>`).join('')}</ul>
                    <button onclick="returnLoan('${loan.id}')" class="btn-primary" style="background:#D32F2F; margin-top:10px;">🛑 TERMINAR</button>
                </div>`).join('') + `</div>`;
        } catch (e) { mainContent.innerHTML = `<p>Error conexión.</p>`; }
    } else mainContent.innerHTML = `<p>Requiere internet.</p>`;
};

window.returnLoan = async (loanId) => {
    if (!confirm("¿Confirmar devolución?")) return;
    if (window.db && window.firebase) {
        const { doc, getDoc, updateDoc } = window.firebase;
        try {
            const loanRef = doc(window.db, "loans", loanId);
            const loanSnap = await getDoc(loanRef);
            if (!loanSnap.exists()) return alert("Error");
            const loanData = loanSnap.data();
            for (let item of loanData.items) {
                const pRef = doc(window.db, "inventory", item.id);
                const ps = await getDoc(pRef);
                if (ps.exists()) await updateDoc(pRef, { available: ps.data().available + item.quantity });
            }
            await updateDoc(loanRef, { status: 'returned', returnDate: Date.now() });
            alert("Devuelto."); renderAdminActiveLoans();
        } catch (e) { alert("Error"); }
    }
};

// --- DASHBOARD ---
const renderAdminDashboard = async () => {
    const barsHtml = [12,19,8,15,22].map((v,i) => `<div class="chart-bar-container"><div class="chart-bar ${i==4?'bar-peak':''}" style="height:${(v/22)*100}%;"><span class="chart-tooltip">${v}</span></div><span class="chart-label">${['L','M','M','J','V'][i]}</span></div>`).join('');
    const inv = await getInventory();
    const low = inv.filter(i => i.available < 2).length;
    mainContent.innerHTML = `
        <h2>Dashboard</h2>
        <div class="dashboard-grid">
            <div class="kpi-card"><h3>${low}</h3><p>⚠️ Stock Bajo</p></div>
            <div class="kpi-card"><h3>Vie</h3><p>Día Pico</p></div>
        </div>
        <div class="chart-section"><div class="chart-container">${barsHtml}</div></div>
        <div style="margin-top:20px; text-align:center;"><button onclick="navigateTo('admin_validate')" class="btn-primary" style="width:auto;">Validar Nuevo</button></div>
    `;
};

// --- GESTIÓN INVENTARIO ---
const renderAdminInventory = async () => {
    mainContent.innerHTML = `
        <h2>Gestión Inventario</h2>
        <form id="add-form" class="admin-form">
            <h3>Alta</h3>
            <label>Nombre:</label><input type="text" id="m-name" required>
            <label>Desc:</label><input type="text" id="m-desc" required>
            <div class="form-row"><div><label>Stock:</label><input type="number" id="m-total" min="1" required></div></div>
            <label>Tags:</label><input type="text" id="m-tags" placeholder="Lab, Mecatrónica">
            <button type="submit">Guardar</button>
        </form>
        <h3>Inventario</h3>
        <div id="adm-list" class="inventory-list"></div>
    `;
    const items = await getInventory();
    document.getElementById('adm-list').innerHTML = items.map(i => `
        <div class="material-card">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <h3 style="margin:0;">${i.name}</h3>
                <button onclick="addStockToProduct('${i.id}', '${i.name}')" style="width:auto; padding:5px; background:#0288D1; font-size:0.8em;">➕ Stock</button>
            </div>
            <p>Disp: ${i.available} / ${i.total}</p>
            <div class="tags-container">${i.tags ? i.tags.map(t=>`<span class="tag">${t}</span>`).join('') : ''}</div>
        </div>`).join('');
    
    document.getElementById('add-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const newItem = {
            name: document.getElementById('m-name').value, description: document.getElementById('m-desc').value,
            total: parseInt(document.getElementById('m-total').value), available: parseInt(document.getElementById('m-total').value),
            tags: document.getElementById('m-tags').value.split(',').map(t=>t.trim())
        };
        if(navigator.onLine && window.db) {
             try { await window.firebase.addDoc(window.firebase.collection(window.db, "inventory"), newItem); alert("Guardado"); await renderAdminInventory(); } 
             catch(err) { alert("Error"); }
        } else alert("Requiere internet");
    });
};

window.addStockToProduct = async (id, name) => {
    const q = prompt(`Añadir stock a ${name}:`);
    if(!q) return;
    const qty = parseInt(q);
    if(qty > 0 && navigator.onLine && window.db) {
        try {
            const ref = window.firebase.doc(window.db, "inventory", id);
            const snap = await window.firebase.getDoc(ref);
            if(snap.exists()) {
                await window.firebase.updateDoc(ref, { total: snap.data().total + qty, available: snap.data().available + qty });
                alert("Stock actualizado"); renderAdminInventory();
            }
        } catch(e) { alert("Error"); }
    } else alert("Error");
};

if('serviceWorker' in navigator) window.addEventListener('load', ()=>navigator.serviceWorker.register('./sw.js'));