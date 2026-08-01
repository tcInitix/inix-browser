# Generates NSIS installer graphics matching the Inix app / new-tab branding.
param(
  [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$buildDir = Join-Path $ProjectRoot "build"
$logoPath = Join-Path $ProjectRoot "public\logo.png"
$iconPath = Join-Path $ProjectRoot "public\icon.png"

if (-not (Test-Path $buildDir)) { New-Item -ItemType Directory -Path $buildDir | Out-Null }
if (-not (Test-Path $logoPath)) { throw "Missing logo: $logoPath" }
if (-not (Test-Path $iconPath)) { throw "Missing icon: $iconPath" }

function Get-InixColor([int]$R, [int]$G, [int]$B, [int]$A = 255) {
  return [System.Drawing.Color]::FromArgb($A, $R, $G, $B)
}

function Draw-InixBackground {
  param(
    [System.Drawing.Graphics]$G,
    [int]$Width,
    [int]$Height,
    [switch]$Compact
  )

  $G.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $G.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $G.Clear((Get-InixColor 9 9 14))

  $purple = Get-InixColor 124 106 239 56
  $teal = Get-InixColor 45 212 191 18

  if ($Compact) {
    $G.FillEllipse((New-Object System.Drawing.SolidBrush $purple), -40, -30, $Width + 80, 90)
  }
  else {
    $glowRect = New-Object System.Drawing.RectangleF (-20, -40, ($Width + 40), ($Height * 0.55))
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddEllipse($glowRect)
    $brush = New-Object System.Drawing.Drawing2D.PathGradientBrush $path
    $brush.CenterColor = (Get-InixColor 124 106 239 90)
    $brush.SurroundColors = @((Get-InixColor 9 9 14 0))
    $centerX = [float]$Width / 2.0
    $brush.CenterPoint = [System.Drawing.PointF]::new($centerX, 40.0)
    $G.FillPath($brush, $path)
    $brush.Dispose()
    $path.Dispose()

    $G.FillEllipse((New-Object System.Drawing.SolidBrush $teal), ($Width * 0.45), ($Height * 0.72), ($Width * 0.7), ($Height * 0.35))
  }
}

function Save-InixSidebar {
  param([string]$OutPath)

  $width = 164
  $height = 314
  $bmp = New-Object System.Drawing.Bitmap $width, $height
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  Draw-InixBackground -G $g -Width $width -Height $height

  $logo = [System.Drawing.Image]::FromFile($logoPath)
  $logoWidth = 118
  $logoHeight = [int]([double]$logo.Height * ($logoWidth / $logo.Width))
  $x = [int](($width - $logoWidth) / 2)
  $y = 54
  $g.DrawImage($logo, $x, $y, $logoWidth, $logoHeight)
  $logo.Dispose()

  $tagline = "Fast. Private. Yours."
  $font = [System.Drawing.Font]::new("Segoe UI", 8.5, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Point)
  $muted = Get-InixColor 168 168 184
  $brush = New-Object System.Drawing.SolidBrush $muted
  $size = $g.MeasureString($tagline, $font)
  $g.DrawString($tagline, $font, $brush, [float]($width - $size.Width) / 2, 188)
  $brush.Dispose()
  $font.Dispose()

  $accentPen = New-Object System.Drawing.Pen (Get-InixColor 124 106 239), 2
  $g.DrawLine($accentPen, 24, ($height - 28), ($width - 24), ($height - 28))
  $accentPen.Dispose()

  $bmp.Save($OutPath, [System.Drawing.Imaging.ImageFormat]::Bmp)
  $g.Dispose()
  $bmp.Dispose()
}

function Save-InixHeader {
  param([string]$OutPath)

  $width = 150
  $height = 57
  $bmp = New-Object System.Drawing.Bitmap $width, $height
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  Draw-InixBackground -G $g -Width $width -Height $height -Compact

  $icon = [System.Drawing.Image]::FromFile($iconPath)
  $iconSize = 28
  $g.DrawImage($icon, 12, 14, $iconSize, $iconSize)
  $icon.Dispose()

  $titleFont = [System.Drawing.Font]::new("Segoe UI", 11, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Point)
  $titleBrush = New-Object System.Drawing.SolidBrush (Get-InixColor 244 244 248)
  $g.DrawString("Inix", $titleFont, $titleBrush, 48, 16)
  $titleBrush.Dispose()
  $titleFont.Dispose()

  $accentPen = New-Object System.Drawing.Pen (Get-InixColor 124 106 239), 2
  $g.DrawLine($accentPen, 0, ($height - 2), $width, ($height - 2))
  $accentPen.Dispose()

  $bmp.Save($OutPath, [System.Drawing.Imaging.ImageFormat]::Bmp)
  $g.Dispose()
  $bmp.Dispose()
}

function Save-InixIco {
  param([string]$OutPath)

  $source = [System.Drawing.Image]::FromFile($iconPath)
  $size = 256
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.Clear([System.Drawing.Color]::Transparent)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.DrawImage($source, 0, 0, $size, $size)
  $source.Dispose()
  $g.Dispose()

  $icon = [System.Drawing.Icon]::FromHandle($bmp.GetHicon())
  $stream = [System.IO.File]::Open($OutPath, [System.IO.FileMode]::Create)
  $icon.Save($stream)
  $stream.Close()
  $icon.Dispose()
  $bmp.Dispose()
}

Save-InixSidebar (Join-Path $buildDir "installerSidebar.bmp")
Copy-Item (Join-Path $buildDir "installerSidebar.bmp") (Join-Path $buildDir "uninstallerSidebar.bmp") -Force
Save-InixHeader (Join-Path $buildDir "installerHeader.bmp")
Save-InixIco (Join-Path $buildDir "installerIcon.ico")
Copy-Item (Join-Path $buildDir "installerIcon.ico") (Join-Path $buildDir "uninstallerIcon.ico") -Force

Write-Host "Installer assets written to $buildDir"
