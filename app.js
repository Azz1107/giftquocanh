// app.js (ESM) — chạy trực tiếp trên GitHub Pages
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

/**
 * ✅ CẤU HÌNH
 * 1) Tạo Firebase project
 * 2) Bật Firestore Database
 * 3) Dán firebaseConfig bên dưới
 */
const firebaseConfig = {
  // TODO: paste config từ Firebase Console (Project settings)
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// Giới hạn số người được tham gia giữ quà
const MAX_SELECTORS = 2;

// Nếu muốn dùng "mã tham gia" để tránh người lạ vào chọn
const REQUIRE_JOIN_CODE = false;
const JOIN_CODE = "tangqua"; // đổi tùy bạn

// "Mã admin" để mở modal thêm quà (chống bạn bè bấm thêm bậy)
const REQUIRE_ADMIN_CODE = true;
const ADMIN_CODE = "admin123"; // đổi tùy bạn

// Nếu Firestore trống, auto seed danh sách này
const DEFAULT_GIFTS = [
  {
    title: "Tai nghe Bluetooth",
    price: "≈ 500k–1tr",
    tag: "công nghệ",
    link: "",
    image: "",
    note: "Ưu tiên loại có mic, pin trâu."
  },
  {
    title: "Sách (bạn chọn thể loại)",
    price: "≈ 150k–400k",
    tag: "sách",
    link: "",
    image: "",
    note: "Mình thích: kỹ năng, kinh doanh, tâm lý, sci-fi."
  },
  {
    title: "LEGO nhỏ / mô hình",
    price: "≈ 300k–900k",
    tag: "hobby",
    link: "",
    image: "",
    note: "Miễn là dễ thương 😄"
  }
];

// -------------------------- UI refs --------------------------
const $ = (sel) => document.querySelector(sel);

const grid = $("#grid");
const skeleton = $("#skeleton");
const emptyState = $("#emptyState");

const whoLabel = $("#whoLabel");
const btnWho = $("#btnWho");
const btnHelp = $("#btnHelp");
const btnAdmin = $("#btnAdmin");

const helpModal = $("#helpModal");
const nameModal = $("#nameModal");
const giftModal = $("#giftModal");

const nameInput = $("#nameInput");
const joinCodeInput = $("#joinCodeInput");
const nameError = $("#nameError");
const saveNameBtn = $("#saveNameBtn");

const giftTitle = $("#giftTitle");
const giftPrice = $("#giftPrice");
const giftTag = $("#giftTag");
const giftLink = $("#giftLink");
const giftImage = $("#giftImage");
const giftNote = $("#giftNote");
const giftError = $("#giftError");
const addGiftBtn = $("#addGiftBtn");

const searchInput = $("#searchInput");
const filterSelect = $("#filterSelect");

const statSelectors = $("#statSelectors");
const statReserved = $("#statReserved");
const statTotal = $("#statTotal");

const statusDot = $("#statusDot");
const statusText = $("#statusText");

// -------------------------- State --------------------------
let db;
let me = {
  name: "",
  id: "" // stable local id
};
let giftsCache = []; // latest gifts
let selectorsCache = []; // latest selector ids

// -------------------------- Helpers --------------------------
function uid() {
  // stable-ish local id
  return "u_" + Math.random().toString(16).slice(2) + Date.now().toString(16);
}
function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
function isValidUrl(url) {
  if (!url) return true;
  try {
    const u = new URL(url);
    return ["http:", "https:"].includes(u.protocol);
  } catch {
    return false;
  }
}
function setOnline(ok, msg) {
  statusDot.style.background = ok ? "rgba(34,197,94,.95)" : "rgba(251,191,36,.85)";
  statusDot.style.boxShadow = ok
    ? "0 0 16px rgba(34,197,94,.30)"
    : "0 0 16px rgba(251,191,36,.25)";
  statusText.textContent = msg;
}

function openModal(modalEl) {
  if (!modalEl.open) modalEl.showModal();
}
function closeModal(modalEl) {
  if (modalEl.open) modalEl.close();
}

// -------------------------- Firestore paths --------------------------
// gifts: collection("gifts")
// meta doc: meta/app
function metaRef() {
  return doc(db, "meta", "app");
}
function giftsCol() {
  return collection(db, "gifts");
}

// -------------------------- Bootstrap --------------------------
init();

async function init() {
  // skeleton
  skeleton.innerHTML = Array.from({ length: 6 })
    .map(() => `<div class="sk"></div>`)
    .join("");

  // load local profile
  const saved = JSON.parse(localStorage.getItem("wishlist_profile") || "null");
  if (saved?.name && saved?.id) me = saved;
  else {
    me.id = uid();
    me.name = "";
  }

  // init firebase
  try {
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
  } catch (e) {
    console.error(e);
    setOnline(false, "Firebase config chưa đúng");
    whoLabel.textContent = "Lỗi cấu hình";
    alert("Bạn chưa dán firebaseConfig đúng trong app.js");
    return;
  }

  // events
  btnHelp.addEventListener("click", () => openModal(helpModal));
  btnWho.addEventListener("click", () => {
    nameInput.value = me.name || "";
    joinCodeInput.value = "";
    hideError(nameError);
    openModal(nameModal);
    setTimeout(() => nameInput.focus(), 50);
  });

  saveNameBtn.addEventListener("click", async (ev) => {
    // dialog form will close; prevent if invalid
    ev.preventDefault();
    const nm = (nameInput.value || "").trim();
    const code = (joinCodeInput.value || "").trim();

    if (!nm || nm.length < 2) {
      showError(nameError, "Tên cần ít nhất 2 ký tự nha.");
      return;
    }
    if (REQUIRE_JOIN_CODE && code !== JOIN_CODE) {
      showError(nameError, "Mã tham gia không đúng.");
      return;
    }

    // try register selector slot
    try {
      await ensureSelectorSlot(me.id, nm);
      me.name = nm;
      localStorage.setItem("wishlist_profile", JSON.stringify(me));
      whoLabel.textContent = `Bạn: ${me.name}`;
      closeModal(nameModal);
    } catch (err) {
      console.error(err);
      showError(nameError, err?.message || "Không thể tham gia lúc này.");
    }
  });

  btnAdmin.addEventListener("click", async () => {
    // require name first
    if (!me.name) {
      openModal(nameModal);
      return;
    }

    if (REQUIRE_ADMIN_CODE) {
      const code = prompt("Nhập mã admin để thêm quà:");
      if (code !== ADMIN_CODE) return;
    }

    // open modal
    clearGiftForm();
    hideError(giftError);
    openModal(giftModal);
  });

  addGiftBtn.addEventListener("click", async (ev) => {
    ev.preventDefault();
    hideError(giftError);

    const payload = {
      title: (giftTitle.value || "").trim(),
      price: (giftPrice.value || "").trim(),
      tag: (giftTag.value || "").trim(),
      link: (giftLink.value || "").trim(),
      image: (giftImage.value || "").trim(),
      note: (giftNote.value || "").trim()
    };

    if (!payload.title || payload.title.length < 2) {
      showError(giftError, "Tên món quà cần ít nhất 2 ký tự.");
      return;
    }
    if (!isValidUrl(payload.link) || !isValidUrl(payload.image)) {
      showError(giftError, "Link/Ảnh phải là URL hợp lệ (http/https).");
      return;
    }

    try {
      await addDoc(giftsCol(), {
        ...payload,
        reservedBy: null,
        reservedByName: null,
        reservedAt: null,
        createdAt: serverTimestamp(),
        createdBy: me.id
      });
      closeModal(giftModal);
    } catch (e) {
      console.error(e);
      showError(giftError, "Không thêm được. Kiểm tra Firestore rules/config nhé.");
    }
  });

  searchInput.addEventListener("input", () => render());
  filterSelect.addEventListener("change", () => render());

  // show who
  whoLabel.textContent = me.name ? `Bạn: ${me.name}` : "Đặt tên";

  // ensure meta doc + maybe seed
  await ensureMetaAndSeedIfEmpty();

  // subscribe
  subscribeMeta();
  subscribeGifts();

  // prompt name if missing
  if (!me.name) openModal(nameModal);
}

function showError(el, msg) {
  el.textContent = msg;
  el.classList.remove("hidden");
}
function hideError(el) {
  el.textContent = "";
  el.classList.add("hidden");
}

function clearGiftForm() {
  giftTitle.value = "";
  giftPrice.value = "";
  giftTag.value = "";
  giftLink.value = "";
  giftImage.value = "";
  giftNote.value = "";
}

async function ensureMetaAndSeedIfEmpty() {
  // ensure meta/app exists
  const mref = metaRef();
  const snap = await getDoc(mref);
  if (!snap.exists()) {
    await setDoc(mref, {
      selectors: [], // array of { id, name, joinedAt }
      maxSelectors: MAX_SELECTORS,
      createdAt: serverTimestamp()
    });
  } else {
    // keep maxSelectors updated (soft)
    const data = snap.data();
    if (!data?.maxSelectors || data.maxSelectors !== MAX_SELECTORS) {
      await updateDoc(mref, { maxSelectors: MAX_SELECTORS });
    }
  }

  // seed gifts if empty
  const all = await getDocs(giftsCol());
  if (all.empty && DEFAULT_GIFTS.length) {
    // add a few defaults
    await Promise.all(
      DEFAULT_GIFTS.map((g) =>
        addDoc(giftsCol(), {
          ...g,
          reservedBy: null,
          reservedByName: null,
          reservedAt: null,
          createdAt: serverTimestamp(),
          createdBy: "seed"
        })
      )
    );
  }
}

async function ensureSelectorSlot(userId, userName) {
  const mref = metaRef();

  return runTransaction(db, async (tx) => {
    const snap = await tx.get(mref);
    if (!snap.exists()) throw new Error("Thiếu meta/app doc.");

    const data = snap.data();
    const max = Number(data.maxSelectors ?? MAX_SELECTORS);
    const arr = Array.isArray(data.selectors) ? data.selectors : [];

    // If already exists, update name and allow
    const idx = arr.findIndex((x) => x?.id === userId);
    if (idx >= 0) {
      const updated = [...arr];
      updated[idx] = { ...updated[idx], name: userName };
      tx.update(mref, { selectors: updated });
      return true;
    }

    // Otherwise check capacity
    if (arr.length >= max) {
      throw new Error(`Hiện đã đủ ${max} người tham gia rồi 🥲`);
    }

    const updated = [...arr, { id: userId, name: userName, joinedAt: Date.now() }];
    tx.update(mref, { selectors: updated });
    return true;
  });
}

function subscribeMeta() {
  onSnapshot(
    metaRef(),
    (snap) => {
      const data = snap.data() || {};
      const selectors = Array.isArray(data.selectors) ? data.selectors : [];
      selectorsCache = selectors.map((s) => s.id);

      statSelectors.textContent = `${selectors.length}/${data.maxSelectors ?? MAX_SELECTORS}`;
      setOnline(true, "Đã kết nối");
    },
    (err) => {
      console.error(err);
      setOnline(false, "Mất kết nối / bị chặn bởi rules");
    }
  );
}

function subscribeGifts() {
  const q = query(giftsCol(), orderBy("createdAt", "desc"));
  onSnapshot(
    q,
    (snap) => {
      giftsCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      skeleton.classList.add("hidden");
      render();
    },
    (err) => {
      console.error(err);
      setOnline(false, "Không đọc được gifts");
      skeleton.classList.add("hidden");
      grid.innerHTML = "";
      emptyState.classList.remove("hidden");
      emptyState.querySelector(".empty__desc").textContent =
        "Không đọc được dữ liệu. Kiểm tra Firestore rules + firebaseConfig.";
    }
  );
}

function render() {
  const term = (searchInput.value || "").trim().toLowerCase();
  const filter = filterSelect.value;

  let list = [...giftsCache];

  if (term) {
    list = list.filter((g) => {
      const blob = `${g.title || ""} ${g.tag || ""} ${g.note || ""} ${g.price || ""}`.toLowerCase();
      return blob.includes(term);
    });
  }

  if (filter === "available") list = list.filter((g) => !g.reservedBy);
  if (filter === "reserved") list = list.filter((g) => !!g.reservedBy);

  // stats
  const total = giftsCache.length;
  const reserved = giftsCache.filter((g) => !!g.reservedBy).length;
  statTotal.textContent = String(total);
  statReserved.textContent = String(reserved);

  if (!total) {
    grid.innerHTML = "";
    emptyState.classList.remove("hidden");
    return;
  }
  emptyState.classList.add("hidden");

  grid.innerHTML = list.map(cardHtml).join("");

  // bind actions
  grid.querySelectorAll("[data-action='toggle']").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const id = e.currentTarget.getAttribute("data-id");
      await toggleReserve(id);
    });
  });

  grid.querySelectorAll("[data-action='delete']").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const id = e.currentTarget.getAttribute("data-id");
      const ok = confirm("Xóa món này khỏi wishlist?");
      if (!ok) return;
      try {
        await deleteDoc(doc(db, "gifts", id));
      } catch (err) {
        console.error(err);
        alert("Không xóa được. Kiểm tra rules.");
      }
    });
  });
}

function cardHtml(g) {
  const title = escapeHtml(g.title);
  const price = escapeHtml(g.price || "");
  const tag = escapeHtml(g.tag || "");
  const note = escapeHtml(g.note || "");
  const link = escapeHtml(g.link || "");
  const img = (g.image || "").trim();

  const reservedBy = g.reservedBy;
  const reservedName = g.reservedByName || "Ai đó";
  const isReserved = !!reservedBy;
  const isMine = reservedBy && me?.id && reservedBy === me.id;

  const ribbon = isReserved
    ? `<div class="ribbon ribbon--reserved">🔒 Đã giữ: <b>${escapeHtml(reservedName)}</b></div>`
    : `<div class="ribbon ribbon--available">✅ Chưa ai giữ</div>`;

  const media = img && isValidUrl(img)
    ? `<img class="card__img" src="${img}" alt="${title}" loading="lazy" referrerpolicy="no-referrer" />`
    : `<div class="card__fallback">🎁</div>`;

  let actionBtn = "";
  if (!me.name) {
    actionBtn = `<button class="btn btn--primary" data-action="toggle" data-id="${g.id}" type="button">👤 Đặt tên để chọn</button>`;
  } else if (!isReserved) {
    actionBtn = `<button class="btn btn--primary" data-action="toggle" data-id="${g.id}" type="button">✨ Giữ chỗ</button>`;
  } else if (isMine) {
    actionBtn = `<button class="btn btn--danger" data-action="toggle" data-id="${g.id}" type="button">↩︎ Bỏ giữ</button>`;
  } else {
    actionBtn = `<button class="btn btn--ghost" type="button" disabled>Đã có người giữ</button>`;
  }

  // delete visible only if createdBy === me.id (basic) + admin code still required to open modal anyway
  const canDelete = me?.id && g.createdBy === me.id;

  return `
    <article class="card">
      <div class="card__media">
        ${media}
        ${ribbon}
      </div>

      <div class="card__body">
        <h3 class="card__title">${title}</h3>

        <div class="meta">
          ${price ? `<span class="pill">💸 ${price}</span>` : ""}
          ${tag ? `<span class="pill">🏷️ ${tag}</span>` : ""}
          ${link ? `<a class="link" href="${link}" target="_blank" rel="noreferrer">Mở link ↗</a>` : ""}
        </div>

        ${note ? `<div class="note">${note}</div>` : ""}

        <div class="card__actions">
          ${actionBtn}
          ${canDelete ? `<button class="btn btn--ghost" data-action="delete" data-id="${g.id}" type="button">🗑️ Xóa</button>` : ""}
        </div>
      </div>
    </article>
  `;
}

async function toggleReserve(giftId) {
  if (!me.name) {
    openModal(nameModal);
    return;
  }

  // ensure user is registered (slot limited)
  try {
    await ensureSelectorSlot(me.id, me.name);
  } catch (e) {
    alert(e?.message || "Không tham gia được.");
    return;
  }

  const ref = doc(db, "gifts", giftId);

  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error("Món quà không tồn tại.");
      const g = snap.data();

      const reservedBy = g.reservedBy || null;

      // If not reserved -> reserve
      if (!reservedBy) {
        tx.update(ref, {
          reservedBy: me.id,
          reservedByName: me.name,
          reservedAt: serverTimestamp()
        });
        return;
      }

      // If reserved by me -> unreserve
      if (reservedBy === me.id) {
        tx.update(ref, {
          reservedBy: null,
          reservedByName: null,
          reservedAt: null
        });
        return;
      }

      // Otherwise blocked
      throw new Error("Món này đã có người khác giữ rồi.");
    });
  } catch (e) {
    console.error(e);
    alert(e?.message || "Không thao tác được.");
  }
}
