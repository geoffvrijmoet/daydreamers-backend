import { NextResponse } from 'next/server'
import { shopifyClient } from '@/lib/shopify'
import sharp from 'sharp'

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const files = formData.getAll('images') as File[]
    
    const results = []

    for (const file of files) {
      try {
        // Convert to buffer
        const buffer = Buffer.from(await file.arrayBuffer())
        
        // Check image metadata
        const metadata = await sharp(buffer).metadata()
        console.log('Image metadata:', metadata)
        
        // Process the image
        let processedBuffer: Buffer
        if (metadata.format === 'webp') {
          // If already WebP, just resize if needed
          processedBuffer = await sharp(buffer)
            .resize(2000, 2000, {
              fit: 'inside',
              withoutEnlargement: true
            })
            .toBuffer()
        } else {
          // Convert to WebP and optimize
          processedBuffer = await sharp(buffer)
            .webp({ quality: 80 })
            .resize(2000, 2000, {
              fit: 'inside',
              withoutEnlargement: true
            })
            .toBuffer()
        }

        console.log('Image processed successfully')

        // Create base64 version of the processed image
        const base64Image = processedBuffer.toString('base64')

        // Create media directly using base64 data
        const createMediaMutation = `
          mutation fileCreate($files: [FileCreateInput!]!) {
            fileCreate(files: $files) {
              files {
                ... on MediaImage {
                  id
                }
              }
              userErrors {
                field
                message
              }
            }
          }
        `

        const mediaResponse = await shopifyClient.graphql(createMediaMutation, {
          files: [{
            alt: file.name.replace(/\.[^/.]+$/, ''),
            contentType: 'IMAGE',
            originalSource: `data:image/webp;base64,${base64Image}`
          }]
        })

        console.log('Media creation response:', mediaResponse)

        if (mediaResponse.fileCreate.userErrors?.length > 0) {
          throw new Error(mediaResponse.fileCreate.userErrors[0].message)
        }

        const mediaId = mediaResponse.fileCreate.files[0]?.id
        if (!mediaId) {
          throw new Error('No media ID returned from Shopify')
        }

        results.push({
          mediaId,
          filename: file.name
        })
        
        console.log('Successfully processed image:', { mediaId })
      } catch (fileError) {
        console.error('Error processing file:', file.name, fileError)
        throw fileError
      }
    }

    return NextResponse.json({ results })
  } catch (error) {
    console.error('Error uploading images:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to upload images' },
      { status: 500 }
    )
  }
} 