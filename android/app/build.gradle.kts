plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.learningos.tracker"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.learningos.tracker"
        minSdk = 26
        targetSdk = 34
        versionCode = (System.getenv("GITHUB_RUN_NUMBER") ?: "1").toInt()
        versionName = "1.0.${System.getenv("GITHUB_RUN_NUMBER") ?: "0"}"
    }

    // The signing key is never stored in the repo: CI writes it from GitHub
    // secrets (see .github/workflows/android-tracker.yml). Each release is
    // signed with the same private key, so updates install over each other
    // and nobody else can publish an "update" to this app.
    val keystorePath = System.getenv("TRACKER_KEYSTORE_PATH")

    signingConfigs {
        if (keystorePath != null) {
            create("tracker") {
                storeFile = file(keystorePath)
                storePassword = System.getenv("TRACKER_KEYSTORE_PASSWORD")
                keyAlias = "tracker"
                keyPassword = System.getenv("TRACKER_KEYSTORE_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.findByName("tracker")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("androidx.work:work-runtime-ktx:2.9.1")
}
