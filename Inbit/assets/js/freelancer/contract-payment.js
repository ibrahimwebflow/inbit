import { supabase } from "../../../supabase/config.js";

document.addEventListener("DOMContentLoaded", loadPendingContracts);

async function loadPendingContracts() {
  const { data: { user } } = await supabase.auth.getUser();
  const container = document.getElementById('pendingContracts');
  
  if (!user) {
    container.innerHTML = '<p class="error">Login required.</p>';
    return;
  }

  // Show loading state
  container.innerHTML = '<div class="loading">Loading contracts requiring payment details...</div>';

  const { data, error } = await supabase
    .from('contracts')
    .select('id, hire_id, total_amount, payment_method, created_at, hires(jobs(title))')
    .eq('freelancer_id', user.id)
    .eq('status', 'pending_details')
    .order('created_at', { ascending: false });

  if (error) {
    container.innerHTML = '<p class="error">Error loading contracts. Please try again.</p>';
    console.error(error);
    return;
  }
  
  if (!data || data.length === 0) {
    container.innerHTML = `
      <div class="empty-contracts">
        <h3>All Payment Details Submitted! ✅</h3>
        <p>You have no contracts awaiting payment details.</p>
        <p>Great job! All your payment information is up to date.</p>
      </div>
    `;
    return;
  }

  // Update pending count
  document.getElementById('pendingCount').textContent = data.length;

  // Render contracts
  container.innerHTML = '<div class="contracts-grid"></div>';
  const contractsGrid = container.querySelector('.contracts-grid');

  data.forEach((contract, index) => {
    const contractCard = document.createElement('div');
    contractCard.className = 'contract-card';
    contractCard.style.animationDelay = `${index * 0.1}s`;
    
    const isBank = contract.payment_method === 'bank_transfer' || contract.payment_method === 'bank';
    
    contractCard.innerHTML = `
      <div class="contract-header">
        <h3 class="contract-title">${contract.hires.jobs.title}</h3>
        <span class="contract-urgency">Action Required</span>
      </div>
      
      <div class="contract-details">
        <div class="detail-item">
          <span class="detail-label">Contract ID</span>
          <span class="detail-value contract-id">#${contract.id}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Amount</span>
          <span class="detail-value amount-value">$${contract.total_amount}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Payment Method</span>
          <span class="detail-value payment-method" data-method="${contract.payment_method}">
            ${isBank ? 'Bank Transfer' : 'Cryptocurrency'}
          </span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Hire ID</span>
          <span class="detail-value">#${contract.hire_id}</span>
        </div>
      </div>

      <div class="payment-form" id="form-${contract.id}">
        <div class="form-title">Provide Your ${isBank ? 'Bank' : 'Crypto'} Details</div>
        
        <div class="form-grid">
          ${isBank ? `
            <div class="bank-fields">
              <input name="bank_name" class="form-input" placeholder="Bank Name" required />
              <input name="account_name" class="form-input" placeholder="Account Holder Name" required />
              <div class="form-row">
                <input name="account_number" class="form-input" placeholder="Account Number" required />
                <input name="swift" class="form-input" placeholder="SWIFT / Routing Code" />
              </div>
            </div>
          ` : `
            <div class="crypto-fields">
              <input name="crypto_network" class="form-input" placeholder="Network (e.g., TRC20, ERC20)" required />
              <input name="wallet_address" class="form-input" placeholder="Wallet Address" required />
            </div>
          `}
        </div>

        <div class="file-upload">
          <label class="file-label">Upload Proof Document (Optional)</label>
          <div class="file-input-wrapper">
            <input type="file" id="proof-${contract.id}" accept=".jpg,.jpeg,.png,.pdf" />
          </div>
        </div>

        <button class="submit-btn" data-id="${contract.id}">Submit Payment Details</button>
      </div>

      <div class="contract-meta">
        <span class="contract-date">Created: ${new Date(contract.created_at).toLocaleDateString()}</span>
        <span class="contract-id">#${contract.id}</span>
      </div>
    `;
    
    contractsGrid.appendChild(contractCard);
  });

  // Attach listeners
  document.querySelectorAll('.submit-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const contractId = e.target.dataset.id;
      await submitContractPaymentDetails(contractId);
    });
  });
}

async function submitContractPaymentDetails(contractId) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) { 
    alert('Please login to submit payment details.'); 
    return; 
  }

  // Show loading state on button
  const button = document.querySelector(`.submit-btn[data-id="${contractId}"]`);
  const originalText = button.innerHTML;
  button.innerHTML = '⏳ Submitting...';
  button.disabled = true;

  // Collect fields from DOM
  const form = document.getElementById(`form-${contractId}`);
  const paymentMethod = form.querySelector('[name="bank_name"]') ? 'bank_transfer' : 'crypto';
  let details = {};
  
  if (paymentMethod === 'bank_transfer') {
    details.bank_name = form.querySelector('[name="bank_name"]').value.trim();
    details.account_name = form.querySelector('[name="account_name"]').value.trim();
    details.account_number = form.querySelector('[name="account_number"]').value.trim();
    details.swift = form.querySelector('[name="swift"]').value.trim();
    
    // Basic validation
    if (!details.bank_name || !details.account_name || !details.account_number) {
      alert('Please fill in all required bank details.');
      button.innerHTML = originalText;
      button.disabled = false;
      return;
    }
  } else {
    details.crypto_network = form.querySelector('[name="crypto_network"]').value.trim();
    details.address = form.querySelector('[name="wallet_address"]').value.trim();
    
    // Basic validation
    if (!details.crypto_network || !details.address) {
      alert('Please fill in all required crypto details.');
      button.innerHTML = originalText;
      button.disabled = false;
      return;
    }
  }

  const proofFile = document.getElementById(`proof-${contractId}`).files[0];

  // Optional upload proof to storage 'proofs' bucket
  let proofUrl = null;
  if (proofFile) {
    const path = `contract-proofs/${contractId}/${Date.now()}-${proofFile.name}`;
    const { error: upErr } = await supabase.storage.from('proofs').upload(path, proofFile);
    if (upErr) {
      alert('Proof upload failed: ' + upErr.message);
      button.innerHTML = originalText;
      button.disabled = false;
      return;
    }
    const { data: urlData } = supabase.storage.from('proofs').getPublicUrl(path);
    proofUrl = urlData.publicUrl;
  }

  // Insert into contract_payment_details
  const { error } = await supabase.from('contract_payment_details').upsert({
    contract_id: contractId,
    freelancer_id: user.id,
    payment_method: paymentMethod,
    details: details,
    proof_url: proofUrl
  }, { onConflict: 'contract_id' });

  if (error) {
    console.error(error);
    alert('Failed to save payment details: ' + error.message);
    button.innerHTML = originalText;
    button.disabled = false;
    return;
  }

  // Notify client and admin
  const { data: contract } = await supabase.from('contracts').select('client_id').eq('id', contractId).single();
  if (contract?.client_id) {
    await supabase.from('notifications').insert({
      user_id: contract.client_id,
      type: 'info',
      message: `Freelancer submitted payment receiving details for contract ${contractId}`
    });
  }

  // Update contract status so client UI knows details provided
  await supabase.from('contracts').update({ status: 'details_provided' }).eq('id', contractId);

  // Show success and reload
  button.innerHTML = '✅ Submitted!';
  setTimeout(() => {
    window.location.reload();
  }, 1500);
}


// Theme Toggle Functionality
function initThemeToggle() {
  const themeToggle = document.getElementById('themeToggle');
  const themeIcon = themeToggle.querySelector('.theme-icon');
  const themeLabel = themeToggle.querySelector('.theme-label');
  
  // Check for saved theme or prefer-color-scheme
  const savedTheme = localStorage.getItem('theme');
  const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
  
  if (savedTheme === 'light' || (!savedTheme && prefersLight)) {
    document.documentElement.setAttribute('data-theme', 'light');
    themeIcon.textContent = '🌙';
    themeLabel.textContent = 'Dark Mode';
  } else {
    document.documentElement.setAttribute('data-theme', 'dark');
    themeIcon.textContent = '☀️';
    themeLabel.textContent = 'Light Mode';
  }
  
  themeToggle.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    
    if (currentTheme === 'light') {
      document.documentElement.setAttribute('data-theme', 'dark');
      themeIcon.textContent = '☀️';
      themeLabel.textContent = 'Light Mode';
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.setAttribute('data-theme', 'light');
      themeIcon.textContent = '🌙';
      themeLabel.textContent = 'Dark Mode';
      localStorage.setItem('theme', 'light');
    }
  });
}

// Initialize theme toggle when DOM loads
document.addEventListener('DOMContentLoaded', () => {
  initThemeToggle();
});
