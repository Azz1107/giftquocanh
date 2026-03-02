import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getFirestore, collection, doc, getDocs, onSnapshot,
  setDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// TODO: dán config của bạn ở đây (từ Firebase console)
const firebaseConfig = { /* ... */ };

const app = initializeApp(firebaseConfig);          // :contentReference[oaicite:3]{index=3}
const db = getFirestore(app);                       // :contentReference[oaicite:4]{index=4}

const grid = document.querySelector("#grid");
const nameEl = document.querySelector("#name");
const noteEl = document.querySelector("#note");

function giftCard(gift, pick) {
  const picked = !!pick;
  const by = pick?.pickedBy ?? "";
  const note = pick?.note ?? "";

  const div = document.createElement("div");
  div.className = "card" + (picked ? " picked" : "");
  div.innerHTML = `
    <img src="${gift.img}" alt="${gift.name}" />
    <h3>${gift.name}</h3>
    ${gift.link ? `<a href="${gift.link}" target="_blank" rel="noreferrer">Link tham khảo</a>` : ""}
    <p class="status">${picked ? `Đã chọn bởi <b>${by}</b>${note ? ` — ${note}` : ""}` : "Chưa ai chọn"}</p>
    <button ${picked ? "disabled" : ""}>${picked ? "Đã được chọn" : "Chọn món này"}</button>
  `;

  const btn = div.querySelector("button");
  btn.addEventListener("click", async () => {
    const pickedBy = nameEl.value.trim();
    const note = noteEl.value.trim();

    if (!pickedBy) {
      alert("Nhập tên bạn trước nhé!");
      return;
    }

    // Ghi pick theo giftId để tránh 2 người pick 2 doc khác nhau
    // (Chống pick trùng chuẩn hơn thì dùng transaction, nhưng bản này đủ cho 1–2 người)
    await setDoc(doc(db, "picks", gift.id), {
      giftId: gift.id,
      pickedBy,
      note,
      pickedAt: serverTimestamp(),
    });

    // setDoc: ghi document :contentReference[oaicite:5]{index=5}
  });

  return div;
}

async function main() {
  // Load gifts
  const giftsSnap = await getDocs(collection(db, "gifts"));
  const gifts = giftsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  // Realtime picks
  onSnapshot(collection(db, "picks"), (snap) => {
    const picks = new Map(snap.docs.map(d => [d.id, d.data()]));
    grid.innerHTML = "";
    gifts.forEach(g => grid.appendChild(giftCard(g, picks.get(g.id))));
  });
}

main();
