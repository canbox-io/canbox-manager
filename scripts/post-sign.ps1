param(
    [string]$InstallDir = "",
    [string[]]$ExtraPaths = @()
)

# Canbox electron.exe ?????
# ??: ? Windows ?????? electron.exe ??????????????
#       ?? Windows Defender Code Integrity (WDCI) ???????
#
# ?? 1 (NSIS ???): powershell.exe -NoProfile -ExecutionPolicy Bypass -File post-sign.ps1 -InstallDir "C:\...\Canbox"
# ?? 2 (manager ???): powershell.exe -NoProfile -ExecutionPolicy Bypass -File post-sign.ps1 -InstallDir "C:\...\Canbox" -ExtraPaths "C:\...\runtime\electron-43.0.0"
# ?? 3 (SEA ???):    powershell.exe -NoProfile -ExecutionPolicy Bypass -File post-sign.ps1 -InstallDir "C:\...\Canbox"
#
# ??: ??? Canbox ??? exe ???
# ?? Windows ???, Linux/macOS ??

if ($PSVersionTable.PSVersion.Major -ge 6 -and $PSVersionTable.Platform -and $PSVersionTable.Platform -ne "Win32NT") {
    Write-Host "[canbox-sign] Non-Windows platform, skipping"
    exit 0
}

$ErrorActionPreference = "Continue"

$scanDirs = New-Object System.Collections.Generic.List[string]

if ($InstallDir -and (Test-Path $InstallDir)) {
    $scanDirs.Add($InstallDir)
}

foreach ($extra in $ExtraPaths) {
    if ($extra -and (Test-Path $extra)) {
        $scanDirs.Add($extra)
    }
}

if ($scanDirs.Count -eq 0) {
    Write-Host "[canbox-sign] No valid directories to scan, skipping"
    exit 0
}

$FRIENDLY_NAME = "Canbox Code Signing"
$SUBJECT = "CN=Canbox Self-Signed Code Signer"

# Step 1: find or create code signing certificate
$cert = Get-ChildItem Cert:\CurrentUser\My -CodeSigningCert -ErrorAction SilentlyContinue |
    Where-Object { $_.FriendlyName -eq $FRIENDLY_NAME } |
    Select-Object -First 1

if (-not $cert) {
    Write-Host "[canbox-sign] Creating self-signed code signing certificate..."
    try {
        $cert = New-SelfSignedCertificate `
            -Type CodeSigningCert `
            -Subject $SUBJECT `
            -FriendlyName $FRIENDLY_NAME `
            -CertStoreLocation "Cert:\CurrentUser\My" `
            -HashAlgorithm SHA256 `
            -KeyAlgorithm RSA `
            -KeyLength 2048 `
            -NotAfter (Get-Date).AddYears(5)

        # Export to temp .cer file, then use certutil to import silently
        # X509Store.Add() triggers CryptUI security confirmation dialog,
        # certutil.exe calls Crypt32.CertAddCertificateContextToStore directly - NO UI.
        $tmpCer = Join-Path ([System.IO.Path]::GetTempPath()) "canbox-signer-$(Get-Random).cer"
        try {
            Export-Certificate -Cert $cert -FilePath $tmpCer -Type Cert | Out-Null

            & certutil.exe -user -f -addstore Root $tmpCer 2>&1 | Out-Null
            & certutil.exe -user -f -addstore TrustedPublisher $tmpCer 2>&1 | Out-Null
        } finally {
            Remove-Item $tmpCer -Force -ErrorAction SilentlyContinue
        }

        Write-Host "[canbox-sign] Certificate created and trusted (thumbprint: $($cert.Thumbprint.Substring(0,16))...)"
    } catch {
        Write-Host "[canbox-sign] ERROR: Failed to create certificate: $_"
        exit 1
    }
} else {
    Write-Host "[canbox-sign] Certificate already exists (thumbprint: $($cert.Thumbprint.Substring(0,16))...)"
}

# Step 2: find and sign all electron.exe across all scan directories
$allElectrons = @()
foreach ($dir in $scanDirs) {
    $found = Get-ChildItem -Path $dir -Filter "electron.exe" -Recurse -ErrorAction SilentlyContinue
    foreach ($f in $found) {
        if ($allElectrons.FullName -notcontains $f.FullName) {
            $allElectrons += $f
        }
    }
}

$count = 0
$skipped = 0

foreach ($exe in $allElectrons) {
    $sig = Get-AuthenticodeSignature $exe.FullName -ErrorAction SilentlyContinue
    $alreadySigned = ($sig.Status -eq "Valid" -and $sig.SignerCertificate.Subject -like "*Canbox*")

    if ($alreadySigned) {
        $skipped++
        continue
    }

    try {
        Set-AuthenticodeSignature `
            -FilePath $exe.FullName `
            -Certificate $cert `
            -HashAlgorithm SHA256 `
            -TimestampServer "http://timestamp.digicert.com" `
            -ErrorAction Stop | Out-Null
        Write-Host "[canbox-sign] Signed: $($exe.FullName)"
        $count++
    } catch {
        Write-Host "[canbox-sign] FAILED to sign $($exe.FullName): $_"
    }
}

Write-Host "[canbox-sign] Done: $count signed, $skipped already signed, total $($allElectrons.Count) electron.exe found"

# write marker file in each scan dir that had electron.exe
foreach ($dir in $scanDirs) {
    $markerPath = Join-Path $dir ".canbox-signed"
    $totalInDir = (Get-ChildItem -Path $dir -Filter "electron.exe" -Recurse -ErrorAction SilentlyContinue).Count
    if ($totalInDir -gt 0) {
        [System.IO.File]::WriteAllText($markerPath, (Get-Date).ToString("s"))
    }
}