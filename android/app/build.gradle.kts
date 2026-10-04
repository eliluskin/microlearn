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

    // A fixed key so each new build installs over the previous one.
    // This is a personal sideloaded app, not a Play Store release key.
    signingConfigs {
        create("tracker") {
            storeFile = file("tracker.keystore")
            storePassword = "learningos"
            keyAlias = "tracker"
            keyPassword = "learningos"
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("tracker")
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
