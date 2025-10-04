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

document.addEventListener("DOMContentLoaded", loadAdminContracts);

async function loadAdminContracts() {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const container = document.getElementById("adminContractsList");

  if (!user) {
    container.innerHTML = "<p class='error'>You must log in as admin.</p>";
    return;
  }

  // Fetch all contracts with related info
  const { data, error } = await supabase
    .from("contracts")
    .select(`
      id,
      hire_id,
      total_amount,
      payment_method,
      status,
      created_at,
      hires(
        jobs(title),
        freelancer:users!hires_freelancer_id_fkey(full_name),
        client:users!hires_client_id_fkey(full_name),
        final_submissions(file_url)
      )
    `)
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    container.innerHTML = "<p class='error'>Error loading contracts.</p>";
    return;
  }

  if (!data || data.length === 0) {
    container.innerHTML = "<p class='empty-state'>No contracts available.</p>";
    return;
  }

  container.innerHTML = "";
  data.forEach((c) => {
    const div = document.createElement("div");
    div.classList.add("card");
    div.classList.add("contract-card");

    let actionButtons = "";

    if (c.status === "pending") {
      actionButtons = `
        <button class="btn btn-primary verify-btn" data-id="${c.id}">Mark as Verified</button>
      `;
    } else if (c.status === "freelancer_received") {
      actionButtons = `
        <button class="btn btn-success release-btn" data-id="${c.id}">Release Project</button>
      `;
    } else if (c.status === "completed") {
      actionButtons = `<span class="completed-badge">✅ Completed</span>`;
    }

    div.innerHTML = `
      <h3>${c.hires?.jobs?.title || 'No Title'}</h3>
      <p><b>Contract ID:</b> ${c.id}</p>
      <p><b>Freelancer:</b> ${c.hires?.freelancer?.full_name || 'N/A'}</p>
      <p><b>Client:</b> ${c.hires?.client?.full_name || 'N/A'}</p>
      <p><b>Amount:</b> $${c.total_amount || '0'}</p>
      <p><b>Payment Method:</b> ${c.payment_method || 'N/A'}</p>
      <p><b>Status:</b> <span class="status-badge status-${c.status}">${c.status}</span></p>
      <small>Created: ${new Date(c.created_at).toLocaleString()}</small>
      ${actionButtons}
    `;
    container.appendChild(div);
  });

  // Verify payment
  document.querySelectorAll(".verify-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const id = e.target.dataset.id;
      await updateContractStatus(id, "verified");
    });
  });

  // Release project
  document.querySelectorAll(".release-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const id = e.target.dataset.id;
      await updateContractStatus(id, "completed");
    });
  });
}

async function updateContractStatus(id, status) {
  const { error: updErr } = await supabase
    .from("contracts")
    .update({ status })
    .eq("id", id);

  if (updErr) {
    console.error("Failed to update contract status:", updErr);
    alert("Failed to update status");
    return;
  }

  if (status === "completed") {
    const { data: contract, error: cErr } = await supabase
      .from("contracts")
      .select("id, total_amount, freelancer_id")
      .eq("id", id)
      .single();

    if (cErr || !contract) {
      console.error("Failed to fetch contract for fee creation:", cErr);
    } else {
      const amount = Number(contract.total_amount) || 0;
      const feeAmount = Math.round((amount * 0.05 + Number.EPSILON) * 100) / 100;

      const { error: feeErr } = await supabase.from("platform_fees").upsert(
        [{
          contract_id: contract.id,
          freelancer_id: contract.freelancer_id,
          fee_amount: feeAmount,
          status: "unpaid"
        }],
        { onConflict: "contract_id" }
      );
      
      if (feeErr) {
        console.error("Failed to upsert platform fee:", feeErr);
      }

      const { error: availErr } = await supabase
        .from("users")
        .update({ available: false })
        .eq("id", contract.freelancer_id);
        
      if (availErr) {
        console.error("Failed to set freelancer availability false:", availErr);
      }

      await supabase.from("notifications").insert({
        user_id: contract.freelancer_id,
        type: "action",
        message: `Congratulations — project ${contract.id} completed. A platform fee of $${feeAmount} was created. Please submit payment proof to clear it.`
      });
    }
  }

  alert(`Contract status updated to ${status}`);
  loadAdminContracts(); // Refresh the list instead of reloading the page
}

