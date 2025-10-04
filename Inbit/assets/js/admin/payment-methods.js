import { supabase } from "../../../supabase/config.js";

async function requireAdmin() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    // Not logged in → redirect to client login
    window.location.href = "../client/login.html";
    return;
  }

  // Check role in users table
  const { data, error: userError } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  if (userError || !data || data.role !== "admin") {
    // Not an admin → redirect
    window.location.href = "../client/login.html";
  }
}

// 🔥 Call immediately on page load
document.addEventListener("DOMContentLoaded", requireAdmin);

document.addEventListener("DOMContentLoaded", () => {
  loadMethods();

  document.getElementById("methodForm").addEventListener("submit", async (e) => {
    e.preventDefault();

    const type = document.getElementById("type").value;
    const label = document.getElementById("label").value;
    let details;
    try {
      details = JSON.parse(document.getElementById("details").value);
    } catch {
      alert("Details must be valid JSON.");
      return;
    }
    const instructions = document.getElementById("instructions").value;
    const proof_img = document.getElementById("proof_img").value;

    const { error } = await supabase.from("admin_payment_methods").insert([
      {
        type,
        label,
        details,
        instructions,
        proof_img,
      },
    ]);

    if (error) {
      console.error(error);
      alert("Error saving method");
    } else {
      alert("Payment method saved");
      e.target.reset();
      loadMethods();
    }
  });
});

async function loadMethods() {
  const container = document.getElementById("methodsList");
  container.innerHTML = "Loading...";

  const { data, error } = await supabase
    .from("admin_payment_methods")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    container.innerHTML = "<p>Error loading methods.</p>";
    return;
  }

  if (!data || data.length === 0) {
    container.innerHTML = "<p>No methods yet.</p>";
    return;
  }

  container.innerHTML = "";
  data.forEach((m) => {
    const div = document.createElement("div");
    div.className = "card";
    div.innerHTML = `
      <h3>${m.label} (${m.type})</h3>
      <pre>${JSON.stringify(m.details, null, 2)}</pre>
      <p>${m.instructions || ""}</p>
      ${m.proof_img ? `<img src="${m.proof_img}" style="max-width:200px;">` : ""}
      <p>Status: ${m.active ? "Active ✅" : "Inactive ❌"}</p>
      <button class="toggle-btn" data-id="${m.id}" data-active="${m.active}">
        ${m.active ? "Deactivate" : "Activate"}
      </button>
      <button class="delete-btn" data-id="${m.id}">Delete</button>
    `;
    container.appendChild(div);
  });

  // activate/deactivate
  document.querySelectorAll(".toggle-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const id = e.target.dataset.id;
      const active = e.target.dataset.active === "true";
      const { error } = await supabase
        .from("admin_payment_methods")
        .update({ active: !active })
        .eq("id", id);
      if (error) alert("Failed to update");
      else loadMethods();
    });
  });

  // delete
  document.querySelectorAll(".delete-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const id = e.target.dataset.id;
      if (!confirm("Delete this method?")) return;
      const { error } = await supabase
        .from("admin_payment_methods")
        .delete()
        .eq("id", id);
      if (error) alert("Failed to delete");
      else loadMethods();
    });
  });
}
