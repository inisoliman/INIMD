Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$build = Join-Path $root 'build'
$icons = Join-Path $build 'icons'
New-Item -ItemType Directory -Force -Path $build | Out-Null
New-Item -ItemType Directory -Force -Path $icons | Out-Null

function New-RoundedPath([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $p.AddArc($x, $y, $d, $d, 180, 90)
  $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $p.CloseFigure()
  return $p
}

# ---------------------------------------------------------------- app icon
$size = 256
$bmp = New-Object System.Drawing.Bitmap $size, $size
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$g.Clear([System.Drawing.Color]::Transparent)

$rect = New-Object System.Drawing.Rectangle 6, 6, 244, 244
$brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
  $rect,
  [System.Drawing.Color]::FromArgb(255, 22, 132, 102),
  [System.Drawing.Color]::FromArgb(255, 7, 63, 49),
  45.0
)
$shape = New-RoundedPath 6 6 244 244 56
$g.FillPath($brush, $shape)

$font = New-Object System.Drawing.Font('Segoe UI', 142, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$fmt = New-Object System.Drawing.StringFormat
$fmt.Alignment = [System.Drawing.StringAlignment]::Center
$fmt.LineAlignment = [System.Drawing.StringAlignment]::Center
$textRect = New-Object System.Drawing.RectangleF 0, -6, 256, 240
$g.DrawString('م', $font, [System.Drawing.Brushes]::White, $textRect, $fmt)

$pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(235, 216, 163, 84)), 11
$pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$g.DrawLine($pen, 78, 205, 178, 205)

$g.Dispose()
$bmp.Save((Join-Path $icons 'app-256.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()

# ---------------------------------------------------------------- file icon
$fbmp = New-Object System.Drawing.Bitmap $size, $size
$fg = [System.Drawing.Graphics]::FromImage($fbmp)
$fg.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$fg.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$fg.Clear([System.Drawing.Color]::Transparent)

$page = New-Object System.Drawing.Drawing2D.GraphicsPath
$page.AddLine(56, 14, 160, 14)
$page.AddLine(208, 62, 208, 242)
$page.AddLine(56, 242, 56, 14)
$page.CloseFigure()
$fg.FillPath([System.Drawing.Brushes]::White, $page)
$fold = New-Object System.Drawing.Drawing2D.GraphicsPath
$fold.AddLine(160, 14, 160, 62)
$fold.AddLine(160, 62, 208, 62)
$fold.CloseFigure()
$fg.FillPath((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 210, 232, 223))), $fold)

$pagePen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 22, 110, 85)), 7
$pagePen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
$fg.DrawPath($pagePen, $page)

$mFont = New-Object System.Drawing.Font('Segoe UI', 96, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$mFmt = New-Object System.Drawing.StringFormat
$mFmt.Alignment = [System.Drawing.StringAlignment]::Center
$mFmt.LineAlignment = [System.Drawing.StringAlignment]::Center
$fg.DrawString('M', $mFont, (New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 14, 96, 74))), (New-Object System.Drawing.RectangleF 56, 108, 152, 110), $mFmt)

$fg.Dispose()
$fbmp.Save((Join-Path $icons 'file-256.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$fbmp.Dispose()

# ---------------------------------------------------------------- downscale
$sizes = @(16, 24, 32, 48, 64, 128)

function Resize-Icon([string]$source, [string]$prefix, [int]$target) {
  $src = [System.Drawing.Image]::FromFile($source)
  $out = New-Object System.Drawing.Bitmap $target, $target
  $gr = [System.Drawing.Graphics]::FromImage($out)
  $gr.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $gr.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $gr.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $gr.DrawImage($src, 0, 0, $target, $target)
  $gr.Dispose()
  $out.Save((Join-Path $icons "$prefix-$target.png"), [System.Drawing.Imaging.ImageFormat]::Png)
  $out.Dispose()
  $src.Dispose()
}

foreach ($s in $sizes) {
  Resize-Icon (Join-Path $icons 'app-256.png') 'app' $s
  Resize-Icon (Join-Path $icons 'file-256.png') 'file' $s
}

Write-Host "PNG icons generated in $icons"
