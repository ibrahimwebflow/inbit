import { supabase } from "../../../supabase/config.js";

document.addEventListener("DOMContentLoaded", loadContracts);

async function loadContracts() {
  const { data: { user } } = await supabase.auth.getUser();

  const container = document.getElementById("contractsList");
  if (!user) {
    container.innerHTML = "<p class='error'>You must be logged in as a client.</p>";
    return;
  }

  // Show loading state
  container.innerHTML = "<div class='loading'>Loading your contracts...</div>";

  const { data, error } = await supabase
    .from("contracts")
    .select(
      `
      id,
      hire_id,
      total_amount,
      payment_method,
      status,
      created_at,
      proof_url,
      hires(
        jobs(title),
        freelancer:users!hires_freelancer_id_fkey(full_name),
        final_submissions(file_url)
      ),
      payment_details:contract_payment_details!contract_payment_details_contract_id_fkey(details)
    `
    )
    .eq("client_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    container.innerHTML = "<p class='error'>Error loading contracts.</p>";
    return;
  }

  if (!data || data.length === 0) {
    container.innerHTML = `
      <div class="empty-contracts">
        <h3>No Contracts Yet</h3>
        <p>You haven't created any contracts yet.</p>
        <p>Start by hiring a freelancer from your matches!</p>
      </div>
    `;
    return;
  }

  // Update summary counters
  updateSummaryCounters(data);

  // Render contracts
  container.innerHTML = '<div class="contracts-grid"></div>';
  const contractsGrid = container.querySelector('.contracts-grid');

  data.forEach((contract, index) => {
    const contractCard = document.createElement("div");
    contractCard.className = "contract-card";
    contractCard.setAttribute("data-status", getStatusType(contract.status));
    contractCard.style.animationDelay = `${index * 0.1}s`;

    const finalSubmission = contract.hires.final_submissions?.[0];
    const paymentDetails = contract.payment_details;
    
    contractCard.innerHTML = `
      <div class="contract-header">
        <h3 class="contract-title">${contract.hires.jobs.title}</h3>
        <span class="contract-badge status-${getStatusClass(contract.status)}">${formatStatus(contract.status)}</span>
      </div>
      
      <div class="contract-details">
        <div class="detail-item">
          <span class="detail-label">Freelancer</span>
          <span class="detail-value">${contract.hires.freelancer?.full_name || 'Unknown'}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Amount</span>
          <span class="detail-value amount-value">$${Number(contract.total_amount).toLocaleString()}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Payment Method</span>
          <span class="detail-value payment-method">${contract.payment_method}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Contract ID</span>
          <span class="detail-value contract-id">#${contract.id}</span>
        </div>
      </div>
      
      ${finalSubmission && contract.status === "completed" ? `
        <div class="contract-actions">
          <a href="${finalSubmission.file_url}" target="_blank" class="btn-download">
            Download Final Project
          </a>
        </div>
      ` : ''}
      
      ${contract.status === "details_provided" && paymentDetails ? `
        <div class="payment-details">
          <h4>Freelancer Payment Details</h4>
          <pre class="details-json">${JSON.stringify(paymentDetails.details, null, 2)}</pre>
          
          <div class="file-upload">
            <label class="file-label">Upload Proof of Payment</label>
            <div class="file-input-wrapper">
              <input type="file" id="proof-${contract.id}" accept=".jpg,.jpeg,.png,.pdf" required/>
            </div>
          </div>
          
          <div class="contract-actions">
            <button class="btn-mark-sent" data-id="${contract.id}">
              Mark Payment Sent
            </button>
          </div>
        </div>
      ` : ''}
      
      ${contract.status === "client_marked_sent" && contract.proof_url ? `
        <div class="payment-details">
          <h4>Payment Proof Submitted</h4>
          <a href="${contract.proof_url}" target="_blank" class="btn-download">
            View Payment Proof
          </a>
        </div>
      ` : ''}
      
      <div class="contract-meta">
        <span class="contract-date">Created: ${new Date(contract.created_at).toLocaleDateString()}</span>
        <span class="contract-id">#${contract.id}</span>
      </div>
    `;

    contractsGrid.appendChild(contractCard);
  });

  // Attach mark sent handlers
  document.querySelectorAll(".btn-mark-sent").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const contractId = e.target.dataset.id;
      const proofFile = document.getElementById(`proof-${contractId}`).files[0];
      await markPaymentSent(contractId, proofFile);
    });
  });
}

function updateSummaryCounters(contracts) {
  const total = contracts.length;
  const active = contracts.filter(c => 
    ['active', 'details_provided', 'client_marked_sent'].includes(c.status)
  ).length;
  const completed = contracts.filter(c => c.status === "completed").length;

  document.getElementById('totalContracts').textContent = total;
  document.getElementById('activeContracts').textContent = active;
  document.getElementById('completedContracts').textContent = completed;
}

function getStatusType(status) {
  const statusMap = {
    'active': 'active',
    'completed': 'completed',
    'details_provided': 'pending',
    'client_marked_sent': 'active'
  };
  return statusMap[status] || 'active';
}

function getStatusClass(status) {
  const classMap = {
    'active': 'active',
    'completed': 'completed',
    'details_provided': 'pending',
    'client_marked_sent': 'sent'
  };
  return classMap[status] || 'active';
}

function formatStatus(status) {
  const statusMap = {
    'active': 'Active',
    'completed': 'Completed',
    'details_provided': 'Awaiting Payment',
    'client_marked_sent': 'Payment Sent'
  };
  return statusMap[status] || status;
}

async function markPaymentSent(contractId, proofFile) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    alert("Please login to mark payment sent.");
    return;
  }

  // Show loading state on button
  const button = document.querySelector(`.btn-mark-sent[data-id="${contractId}"]`);
  const originalText = button.innerHTML;
  button.innerHTML = '⏳ Processing...';
  button.disabled = true;

  // Upload proof
  let proofUrl = null;
  if (proofFile) {
    const path = `payment-proofs/${contractId}/${Date.now()}-${proofFile.name}`;
    const { error: upErr } = await supabase.storage
      .from("proofs")
      .upload(path, proofFile);

    if (upErr) {
      console.error(upErr);
      alert("Upload failed: " + upErr.message);
      button.innerHTML = originalText;
      button.disabled = false;
      return;
    }

    const { data: urlData } = supabase.storage.from("proofs").getPublicUrl(path);
    proofUrl = urlData.publicUrl;
  }

  // Update contract status
  const { error } = await supabase
    .from("contracts")
    .update({ status: "client_marked_sent", proof_url: proofUrl })
    .eq("id", contractId);

  if (error) {
    console.error(error);
    alert("Failed to update contract.");
    button.innerHTML = originalText;
    button.disabled = false;
    return;
  }

  // Notify freelancer
  const { data: contract } = await supabase
    .from("contracts")
    .select("freelancer_id")
    .eq("id", contractId)
    .single();

  if (contract?.freelancer_id) {
    await supabase.from("notifications").insert({
      user_id: contract.freelancer_id,
      type: "info",
      message: `Client marked payment sent for contract ${contractId}.`,
    });
  }

  // Show success and reload
  button.innerHTML = '✅ Sent!';
  setTimeout(() => {
    window.location.reload();
  }, 1500);
}