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

document.addEventListener("DOMContentLoaded", loadFeesAdmin);

async function loadFeesAdmin() {
  const { data: { user } } = await supabase.auth.getUser();
  const container = document.getElementById("feesList");
  
  if (!user) { 
    container.innerHTML = "<p class='error'>Login required.</p>"; 
    return; 
  }

  const { data, error } = await supabase
    .from("platform_fees")
    .select("id, contract_id, freelancer_id, fee_amount, status, proof_url, created_at")
    .in("status", ["pending_verification", "unpaid"])
    .order("created_at", { ascending: false });

  if (error) { 
    console.error(error); 
    container.innerHTML = "<p class='error'>Error loading fees.</p>"; 
    return; 
  }
  
  if (!data || data.length === 0) { 
    container.innerHTML = "<p class='empty-state'>No fees to verify.</p>"; 
    return; 
  }

  container.innerHTML = "";
  
  for (const f of data) {
    const div = document.createElement("div");
    div.className = "fee-card";
    
    div.innerHTML = `
      <p><b>Contract ID:</b> ${f.contract_id}</p>
      <p><b>Freelancer ID:</b> ${f.freelancer_id}</p>
      <p><b>Amount:</b> $${Number(f.fee_amount).toFixed(2)}</p>
      <p><b>Status:</b> <span class="status-badge status-${f.status}">${f.status.replace('_', ' ')}</span></p>
      <p><b>Proof:</b> ${f.proof_url ? 
        `<a href="${f.proof_url}" target="_blank" class="proof-link">View Payment Proof</a>` : 
        '<span class="no-proof">No proof uploaded</span>'
      }</p>
      <small>Created: ${new Date(f.created_at).toLocaleString()}</small>
      <div class="action-buttons">
        <button class="mark-paid-btn" data-id="${f.id}">✅ Mark Paid</button>
        <button class="reject-fee-btn" data-id="${f.id}">❌ Reject</button>
      </div>
    `;
    
    container.appendChild(div);
  }

  // Add event listeners
  document.querySelectorAll(".mark-paid-btn").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      const id = e.target.dataset.id;
      await verifyFee(id, true);
    });
  });
  
  document.querySelectorAll(".reject-fee-btn").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      const id = e.target.dataset.id;
      await verifyFee(id, false);
    });
  });
}

async function verifyFee(feeId, approve) {
  const newStatus = approve ? "paid" : "rejected";
  const { error } = await supabase.from("platform_fees")
    .update({ status: newStatus })
    .eq("id", feeId);
    
  if (error) { 
    console.error(error); 
    alert("Failed to update fee status."); 
    return; 
  }

  if (approve) {
    const { data: fee } = await supabase.from("platform_fees")
      .select("freelancer_id, contract_id")
      .eq("id", feeId)
      .single();
      
    if (fee?.freelancer_id) {
      await supabase.from("users")
        .update({ available: true })
        .eq("id", fee.freelancer_id);
        
      await supabase.from("notifications").insert({
        user_id: fee.freelancer_id,
        type: "info",
        message: `Your platform fee for contract ${fee.contract_id} is verified. You can now set availability.`
      });
    }
  } else {
    const { data: fee } = await supabase.from("platform_fees")
      .select("freelancer_id, contract_id")
      .eq("id", feeId)
      .single();
      
    if (fee?.freelancer_id) {
      await supabase.from("notifications").insert({
        user_id: fee.freelancer_id,
        type: "action",
        message: `Your platform fee proof for ${fee.contract_id} was rejected. Please reupload proof.`
      });
    }
  }

  alert(`Fee ${newStatus} successfully!`);
  loadFeesAdmin(); // Refresh the list
}