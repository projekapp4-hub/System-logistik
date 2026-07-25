// GANTI DENGAN URL WEB APP YANG KAMU DAPATKAN SAAT DEPLOY DI GAS
const GAS_URL = "https://script.google.com/macros/s/AKfycbyOm2MWRk6cKG4mcwAAG3QwsQHxGasARYj0yJbXzkJB-dcH-S7GiZSEz4YetJXZrQj-/exec";

// State data global aplikasi
let masterBarang = [];
let masterPetugas = [];
let currentSiswaData = null;

// Jalankan pengambilan data dropdown secara otomatis saat aplikasi dibuka
document.addEventListener("DOMContentLoaded", () => {
    loadDropdownData();
});

/**
 * Mengambil data master barang dan petugas dari GAS
 */
async function loadDropdownData() {
    try {
        const response = await fetch(GAS_URL, {
            method: 'POST',
            body: JSON.stringify({ action: 'getDropdownData' })
        });
        const result = await response.json();
        
        masterBarang = result.barang || [];
        masterPetugas = result.petugas || [];
        
        // Isi dropdown petugas utama
        const selectPetugas = document.getElementById('select-petugas');
        masterPetugas.forEach(petugas => {
            let opt = document.createElement('option');
            opt.value = petugas;
            opt.textContent = petugas;
            selectPetugas.appendChild(opt);
        });
    } catch (error) {
        console.error("Gagal memuat data awal master:", error);
        alert("Gagal terhubung ke server Google Sheets. Cek koneksi internet atau URL App Script.");
    }
}

/**
 * 1. Fungsi Menangani Pencarian Data Siswa
 */
async function handleSearchSiswa() {
    const nisInput = document.getElementById('input-nis').value.trim();
    const errorBanner = document.getElementById('search-error');
    const btnSearch = document.getElementById('btn-search');
    
    if (!nisInput) return;
    
    btnSearch.disabled = true;
    btnSearch.textContent = "Mencari...";
    errorBanner.classList.add('hidden');

    try {
        const response = await fetch(GAS_URL, {
            method: 'POST',
            body: JSON.stringify({ action: 'getSiswa', nis: nisInput })
        });
        const result = await response.json();

        if (result.success) {
            currentSiswaData = result.data;
            showFormState(result.data);
        } else {
            // FITUR 1: Jika gagal karena NON BEASISWA atau NIS salah, pesan langsung muncul di elemen HTML
            errorBanner.textContent = result.message;
            errorBanner.classList.remove('hidden');
            
            // Set warna khusus merah menyala jika kena blokir sistem Non Beasiswa
            if(result.isNonBeasiswa) {
                errorBanner.style.backgroundColor = "#fee2e2";
                errorBanner.style.color = "#b91c1c";
            }
        }
    } catch (error) {
        errorBanner.textContent = "Terjadi gangguan jaringan sistem.";
        errorBanner.classList.remove('hidden');
    } finally {
        btnSearch.disabled = false;
        btnSearch.textContent = "Cari";
    }
}

/**
 * Mengubah state UI ke mode pengisian formulir setelah siswa ditemukan
 */
function showFormState(siswa) {
    document.getElementById('search-section').classList.add('hidden');
    document.getElementById('form-section').classList.remove('hidden');
    
    // Mengisi informasi profile
    document.getElementById('siswa-nis').textContent = siswa.nis;
    document.getElementById('siswa-nama').textContent = siswa.nama;
    document.getElementById('siswa-kelas').textContent = siswa.kelas;
    document.getElementById('siswa-asrama').textContent = siswa.asrama;
    document.getElementById('siswa-status').textContent = siswa.status;

    // Bersihkan daftar barang lama, dan buatkan minimal satu baris baru kosong
    document.getElementById('barang-list-container').innerHTML = '';
    addBarangRow();
}

/**
 * Fungsi untuk menambah baris pilihan barang secara dinamis (Multi-Item)
 */
function addBarangRow() {
    const container = document.getElementById('barang-list-container');
    const rowId = 'row-' + Date.now() + Math.floor(Math.random() * 100);
    
    const rowDiv = document.createElement('div');
    rowDiv.className = 'barang-row';
    rowDiv.id = rowId;
    
    // Pembuatan Dropdown ter-filter berdasarkan data 'sudahAmbil' milik siswa aktif
    let selectHtml = `<select class="item-select" required><option value="">-- Pilih Barang (Stok) --</option>`;
    
    let barangTersediaCount = 0;
    masterBarang.forEach(barang => {
        // Cek apakah di data siswa, barang ini sudah bernilai true ('v')
        const sudahPernahAmbil = currentSiswaData && currentSiswaData.sudahAmbil && currentSiswaData.sudahAmbil[barang.nama];
        
        // JIKA BELUM PERNAH AMBIL, TAMPILKAN DI DROPDOWN
        if (!sudahPernahAmbil) {
            selectHtml += `<option value="${barang.nama}">${barang.nama} (Stok: ${barang.stok})</option>`;
            barangTersediaCount++;
        }
    });
    
    selectHtml += `</select>`;
    
    if(barangTersediaCount === 0) {
        alert("Siswa ini sudah mengambil semua jatah barang logistik yang tersedia!");
        return;
    }
    
    rowDiv.innerHTML = `
        ${selectHtml}
        <input type="number" class="item-qty" value="1" min="1" max="1" readonly style="background-color: #e5e7eb; cursor: not-allowed;">
        <button type="button" class="btn-remove-row" onclick="removeBarangRow('${rowId}')">×</button>
    `;
    // Catatan: Kuantitas di-lock ke angka '1' dan dibuat readonly agar sesuai aturan "hanya boleh mengambil satu barang tiap jenis"
    
    container.appendChild(rowDiv);
}

/**
 * Fungsi menghapus baris barang tertentu
 */
function removeBarangRow(rowId) {
    const row = document.getElementById(rowId);
    const container = document.getElementById('barang-list-container');
    // Sisakan minimal 1 baris agar user tidak bingung
    if (container.children.length > 1) {
        row.remove();
    } else {
        alert("Minimal harus ada 1 baris barang yang dipilih!");
    }
}

/**
 * 2 & 6. Mengumpulkan Data Form dan Mengirimkan ke Server
 */
async function handleSubmitTransaksi() {
    const petugas = document.getElementById('select-petugas').value;
    const btnSubmit = document.getElementById('btn-submit');
    
    if (!petugas) {
        alert("Pilih nama petugas terlebih dahulu!");
        return;
    }

    const rows = document.querySelectorAll('.barang-row');
    const barangList = [];
    const checkDuplicateItems = new Set();
    
    for (let row of rows) {
        const nama = row.querySelector('.item-select').value;
        const jumlah = row.querySelector('.item-qty').value;
        
        if (!nama) {
            alert("Harap lengkapi nama barang pada baris input!");
            return;
        }

        if (checkDuplicateItems.has(nama)) {
            alert(`Kamu memilih barang [ ${nama} ] lebih dari 1 kali di form! Kumpulkan dalam 1 baris.`);
            return;
        }
        checkDuplicateItems.add(nama);
        barangList.push({ nama: nama, jumlah: Number(jumlah) });
    }

    if(barangList.length === 0) return;

    const payload = {
        siswa: currentSiswaData,
        petugas: petugas,
        barangList: barangList
    };

    btnSubmit.disabled = true;
    btnSubmit.textContent = "Menyimpan...";

    try {
        const response = await fetch(GAS_URL, {
            method: 'POST',
            body: JSON.stringify({ action: 'submitPengambilan', payload: payload })
        });
        const result = await response.json();

        if (result.success) {
            // TAMPILAN ELEMEN HTML SUKSES (Menggunakan Alert Bawaan Aplikasi Web agar menonjol lalu reset)
            alert(result.message);
            
            // Muat ulang master data agar sinkron
            await loadDropdownData(); 
            resetToSearchState();
        } else {
            // TAMPILAN ELEMEN HTML GAGAL (Jika ditolak gudang / validasi jatah berganda di backend)
            alert("GAGAL: " + result.message);
        }
    } catch (error) {
        alert("Terjadi kegagalan komunikasi dengan database cloud.");
    } finally {
        btnSubmit.disabled = false;
        btnSubmit.textContent = "Simpan Transaksi";
    }
}

/**
 * 7. Mengembalikan halaman web ke tampilan awal (Form Pencarian NIS)
 */
function resetToSearchState() {
    currentSiswaData = null;
    document.getElementById('input-nis').value = '';
    document.getElementById('select-petugas').value = '';
    document.getElementById('barang-list-container').innerHTML = '';
    
    document.getElementById('form-section').classList.add('hidden');
    document.getElementById('search-section').classList.remove('hidden');
}