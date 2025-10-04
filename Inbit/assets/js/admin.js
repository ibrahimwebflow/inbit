import { supabase } from "../../supabase/config.js";


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

const resultsDiv = document.getElementById("results");

// Load users awaiting verification
export async function loadPendingUsers() {
  const { data, error } = await supabase
    .from("users")
    .select("id, full_name, email, role, gov_id_path")
    .eq("verified", false);

  if (error) {
    resultsDiv.innerHTML = "Error loading users.";
    console.error(error);
    return;
  }

  resultsDiv.innerHTML = "<h2>Pending Users</h2>";

  if (!data || data.length === 0) {
    resultsDiv.innerHTML += "<p>No pending users.</p>";
    return;
  }

  for (const user of data) {
    let idUrl = null;

    if (user.gov_id_path) {
      // choose the correct bucket based on role
      const bucket = user.role === "freelancer" ? "id_verifications" : "ids";

      const { data: urlData, error: urlErr } = await supabase.storage
        .from(bucket)
        .createSignedUrl(user.gov_id_path, 60);

      if (!urlErr) {
        idUrl = urlData.signedUrl;
      }
    }

    resultsDiv.innerHTML += `
      <div class="card">
        <p><b>${user.full_name}</b> (${user.role})</p>
        <p>Email: ${user.email}</p>
        ${
          idUrl
            ? `<p><a href="${idUrl}" target="_blank">View ID Document</a></p>`
            : `<p><i>No ID uploaded</i></p>`
        }
        <button onclick="verifyUser('${user.id}')">Verify</button>
      </div>
    `;
  }
}


// Verify user
window.verifyUser = async function (userId) {
  const { error } = await supabase
    .from("users")
    .update({ verified: true })
    .eq("id", userId);

  if (error) {
    alert("Verification failed: " + error.message);
  } else {
    alert("User verified!");
    loadPendingUsers();
  }
};


// Load jobs awaiting approval
export async function loadPendingJobs() {
  const { data, error } = await supabase
    .from("jobs")
    .select("*")
    .eq("approved", false);

  if (error) {
    resultsDiv.innerHTML = "Error loading jobs.";
    return;
  }

  resultsDiv.innerHTML = "<h2>Pending Jobs</h2>";
  data.forEach(job => {
    resultsDiv.innerHTML += `
      <div class="card">
        <p><b>${job.title}</b></p>
        <p>${job.description}</p>
        <button onclick="approveJob('${job.id}')">Approve</button>
      </div>
    `;
  });
}

// Approve job
import { runMatching } from "./matching.js";

window.approveJob = async function(jobId) {
  const { error } = await supabase
    .from("jobs")
    .update({ approved: true })
    .eq("id", jobId);

  if (error) {
    alert("Approval failed: " + error.message);
  } else {
    // ✅ Run matching after approval
    await runMatching(jobId);
    console.log("Running matching for job ID:", jobId);
    alert("Job approved and matching started!");
    loadPendingJobs();
  }
};


// Load success fees awaiting confirmation
export async function loadPendingFees() {
  const { data, error } = await supabase
    .from("success_fees")
    .select("*")
    .eq("paid", true)
    .eq("admin_confirmed", false);

  if (error) {
    resultsDiv.innerHTML = "Error loading fees.";
    return;
  }

  resultsDiv.innerHTML = "<h2>Pending Fees</h2>";
  data.forEach(fee => {
    resultsDiv.innerHTML += `
      <div class="card">
        <p>Freelancer: ${fee.freelancer_id}</p>
        <p>Job: ${fee.job_id}</p>
        <p>Amount: $${fee.amount}</p>
        <button onclick="confirmFee('${fee.id}')">Confirm Fee</button>
      </div>
    `;
  });
}

// Confirm fee
window.confirmFee = async function(feeId) {
  const { error } = await supabase
    .from("success_fees")
    .update({ admin_confirmed: true })
    .eq("id", feeId);

  if (error) {
    alert("Fee confirmation failed: " + error.message);
  } else {
    alert("Fee confirmed!");
    loadPendingFees();
  }
};

// Load job matches awaiting approval
export async function loadPendingMatches() {
  const { data, error } = await supabase
    .from("job_matches")
    .select(`
      id,
      score,
      approved,
      jobs(title, description),
      users(full_name, tone, language)
    `)
    .eq("approved", false);

  if (error) {
    resultsDiv.innerHTML = "Error loading matches.";
    return;
  }

  resultsDiv.innerHTML = "<h2>Pending Matches</h2>";

  if (data.length === 0) {
    resultsDiv.innerHTML += "<p>No pending matches.</p>";
    return;
  }

  data.forEach(match => {
    resultsDiv.innerHTML += `
      <div class="card">
        <h3>Job: ${match.jobs.title}</h3>
        <p>${match.jobs.description}</p>
        <hr>
        <p><b>Freelancer:</b> ${match.users.full_name}</p>
        <p>Tone: ${match.users.tone}, Language: ${match.users.language}</p>
        <p>Score: ${match.score}</p>
        <button onclick="approveMatch(${match.id})">Approve</button>
        <button onclick="rejectMatch(${match.id})">Reject</button>
      </div>
    `;
  });
}

// Approve match
window.approveMatch = async function(matchId) {
  const { error } = await supabase
    .from("job_matches")
    .update({ approved: true })
    .eq("id", matchId);

  if (error) {
    alert("Approval failed: " + error.message);
  } else {
    alert("Match approved!");
    loadPendingMatches();
  }
};

// Reject match
window.rejectMatch = async function(matchId) {
  const { error } = await supabase
    .from("job_matches")
    .delete()
    .eq("id", matchId);

  if (error) {
    alert("Rejection failed: " + error.message);
  } else {
    alert("Match rejected!");
    loadPendingMatches();
  }
};


document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("btnUsers").addEventListener("click", loadPendingUsers);
  document.getElementById("btnJobs").addEventListener("click", loadPendingJobs);
  document.getElementById("btnFees").addEventListener("click", loadPendingFees);
  document.getElementById("btnMatch").addEventListener("click", loadPendingMatches)
});


// ADMIN: confirm release and mark completed
export async function adminConfirmRelease(contractId) {
  // Fetch the contract
  const { data: contract, error: fetchErr } = await supabase
    .from("contracts")
    .select("*")
    .eq("id", contractId)
    .single();

  if (fetchErr) {
    console.error("Failed to fetch contract:", fetchErr.message);
    throw fetchErr;
  }

  // Update contract status
  const { error: updErr } = await supabase
    .from("contracts")
    .update({
      admin_confirmed: true,
      status: "released"
    })
    .eq("id", contractId);

  if (updErr) {
    console.error("Failed to update contract:", updErr.message);
    throw updErr;
  }

  // Log payment in payments table
  const { error: payErr } = await supabase.from("payments").insert({
    job_id: contract.hire_id,           // if payments.job_id is uuid, this matches since hire_id is uuid
    client_id: contract.client_id,
    freelancer_id: contract.freelancer_id,
    amount: contract.total_amount,
    method: contract.payment_method,
    client_marked_sent: contract.client_marked_sent,
    freelancer_marked_received: contract.freelancer_marked_received
  });

  if (payErr) {
    console.warn("Payment log insert issue:", payErr.message);
  }

  // Notify freelancer & client
  await supabase.from("notifications").insert([
    {
      user_id: contract.freelancer_id,
      type: "payment",
      message: `Admin confirmed release for contract ${contractId}`
    },
    {
      user_id: contract.client_id,
      type: "payment",
      message: `Admin confirmed release for contract ${contractId}`
    }
  ]);

  return true;
}


// admin.js

export async function loadPendingPaymentDetails() {
  const { data, error } = await supabase
    .from('contract_payment_details')
    .select('id, contract_id, freelancer_id, payment_method, details, proof_url, verified, created_at, contracts(client_id, total_amount)')
    .eq('verified', false)
    .order('created_at', { ascending: true });

  const results = document.getElementById('adminPaymentDetails');
  if (error) { results.innerHTML = 'Error'; console.error(error); return; }
  if (!data || data.length === 0) { results.innerHTML = '<p>No pending payment details</p>'; return; }

  results.innerHTML = '';
  data.forEach(d => {
    const div = document.createElement('div');
    div.classList.add('card');
    div.innerHTML = `
      <p><b>Contract:</b> ${d.contract_id} — Amount: ${d.contracts?.total_amount || ''}</p>
      <p><b>Freelancer:</b> ${d.freelancer_id}</p>
      <p><b>Method:</b> ${d.payment_method}</p>
      <pre>${JSON.stringify(d.details, null, 2)}</pre>
      ${d.proof_url ? `<a href="${d.proof_url}" target="_blank">View Proof</a>` : ''}
      <button class="verify-btn" data-id="${d.id}">Verify Details</button>
    `;
    results.appendChild(div);
  });

  // attach listeners
  document.querySelectorAll('.verify-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = e.target.dataset.id;
      await verifyPaymentDetails(id);
      loadPendingPaymentDetails();
    });
  });
}

export async function verifyPaymentDetails(id) {
  const { error } = await supabase
    .from('contract_payment_details')
    .update({ verified: true })
    .eq('id', id);

  if (error) {
    console.error('Verify failed', error);
  } else {
    // notify client & freelancer
    const { data } = await supabase.from('contract_payment_details').select('contract_id, freelancer_id').eq('id', id).single();
    const { data: contract } = await supabase.from('contracts').select('client_id').eq('id', data.contract_id).single();
    if (contract?.client_id) {
      await supabase.from('notifications').insert({
        user_id: contract.client_id,
        type: 'info',
        message: `Admin verified freelancer payment details for contract ${data.contract_id}.`
      });
    }
    await supabase.from('notifications').insert({
      user_id: data.freelancer_id,
      type: 'info',
      message: `Admin verified your payment details for contract ${data.contract_id}.`
    });
  }
}


document.addEventListener("DOMContentLoaded", () => {
  if (document.getElementById("adminPaymentDetails")) {
    loadPendingPaymentDetails();
  }
});


export async function loadContractsAwaitingRelease() {
  const { data, error } = await supabase
    .from("contracts")
    .select("id, total_amount, currency, client_id, freelancer_id, status, proof_url, created_at")
    .eq("status", "payment_sent")
    .order("created_at", { ascending: true });

  const container = document.getElementById("adminContractsList");
  if (error) {
    container.innerHTML = "<p>Error loading contracts</p>";
    console.error(error);
    return;
  }
  if (!data || data.length === 0) {
    container.innerHTML = "<p>No contracts awaiting release.</p>";
    return;
  }

  container.innerHTML = "";
  data.forEach(c => {
    const div = document.createElement("div");
    div.classList.add("card");
    div.innerHTML = `
      <p><b>Contract ID:</b> ${c.id}</p>
      <p><b>Amount:</b> ${c.total_amount} ${c.currency}</p>
      <p><b>Status:</b> ${c.status}</p>
      ${c.proof_url ? `<p><b>Proof:</b> <a href="${c.proof_url}" target="_blank">View</a></p>` : ""}
      <button class="confirm-release-btn" data-id="${c.id}">Confirm Release</button>
    `;
    container.appendChild(div);
  });

  // attach listeners
  document.querySelectorAll(".confirm-release-btn").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      const id = e.target.dataset.id;
      try {
        await adminConfirmRelease(id);
        alert("Contract released successfully.");
        loadContractsAwaitingRelease(); // refresh list
      } catch (err) {
        alert("Error: " + err.message);
      }
    });
  });
}


document.addEventListener("DOMContentLoaded", () => {
  if (document.getElementById("adminContractsList")) {
    loadContractsAwaitingRelease();
  }
});


